import kv from "./kv";
import config from "./config";
import log from "./logger";
import fetchTle from "./tleFetcher";
import { isCelestrakLockedOut } from "./lockout";
import { isDerivedGroup } from "./derivedGroup";

export function getRandomJitter(maxJitterMs: number): number {
	if (maxJitterMs <= 0) return 0;
	return Math.floor(Math.random() * maxJitterMs);
}

async function checkAndUpdateTles(): Promise<void> {
	const lockout = await isCelestrakLockedOut();
	if (lockout.locked) {
		log.warn(`Celestrak is currently in 24-hour lockout (until ${lockout.untilIso}). Skipping background cron updates.`);
		return;
	}

	log.debug("Running scheduled TLE update check...");
	const now = Date.now();

	for (const group of config.allowedGroups) {
		if (isDerivedGroup(group)) {
			continue;
		}

		const queryType = config.specialGroups.includes(group) ? "SPECIAL" : "GROUP";

		const tsKey = `${group}_timestamp_csv`;
		const timestamp = (await kv.get(tsKey)) as number | null;

		const isPrimaryGroup = group === "active";

		if (!timestamp) {
			if (!isPrimaryGroup) {
				continue;
			}
			log.info(`Primary group "${group}" is uninitialized. Fetching initial GP data...`);
		} else {
			const refreshThreshold = group === "active" ? config.cacheActiveDuration : config.cacheDuration;
			const age = now - timestamp;
			if (age < refreshThreshold) {
				continue;
			}
			const ageHours = (age / (60 * 60 * 1000)).toFixed(1);
			log.info(`Group "${group}" GP data age (${ageHours}h) exceeds cache duration. Refreshing...`);
		}

		try {
			await fetchTle(group, "csv", queryType);
		} catch (err) {
			log.error(`Background cron failed to update group "${group}": ${err}`);
		}

		const interFetchDelay = 3000 + Math.floor(Math.random() * 5000);
		await new Promise((resolve) => setTimeout(resolve, interFetchDelay));
	}
}

function scheduleNextCheck(): void {
	const jitterMs = getRandomJitter(config.cronJitter);
	const nextDelayMs = config.cronInterval + jitterMs;
	log.debug(
		`Next TLE cron update check in ${(nextDelayMs / 1000).toFixed(0)}s (including ${(jitterMs / 1000).toFixed(0)}s random jitter).`,
	);

	setTimeout(async () => {
		try {
			await checkAndUpdateTles();
		} catch (err) {
			log.error(`Periodic TLE background check error: ${err}`);
		} finally {
			scheduleNextCheck();
		}
	}, nextDelayMs);
}

export function startTleCron(): void {
	const maxAgeDays = (config.maxStorageAge / (24 * 60 * 60 * 1000)).toFixed(1);
	log.info(
		`Starting TLE background updater (interval: ${config.cronInterval / 1000}s, max jitter: ${config.cronJitter / 1000}s, max age: ${maxAgeDays} days).`,
	);

	checkAndUpdateTles().catch((err) => {
		log.error(`Initial TLE background check error: ${err}`);
	});

	scheduleNextCheck();
}
