import kv from "./kv";
import config from "./config";
import log from "./logger";
import fetchTle from "./tleFetcher";

export function getRandomJitter(maxJitterMs: number): number {
	if (maxJitterMs <= 0) return 0;
	return Math.floor(Math.random() * maxJitterMs);
}

async function checkAndUpdateTles(): Promise<void> {
	log.debug("Running scheduled TLE update check...");
	const now = Date.now();

	for (const group of config.allowedGroups) {
		const queryType = config.specialGroups.includes(group) ? "SPECIAL" : "GROUP";
		for (const format of config.formats) {
			const tsKey = `${group}_timestamp_${format}`;
			const timestamp = (await kv.get(tsKey)) as number | null;

			const age = timestamp ? now - timestamp : Infinity;

			if (!timestamp || age >= config.maxStorageAge) {
				const ageDays = timestamp ? (age / (24 * 60 * 60 * 1000)).toFixed(1) : "infinity";
				log.info(`Group "${group}" format "${format}" TLE age (${ageDays} days) >= maxStorageAge limit. Fetching fresh TLE...`);
				try {
					await fetchTle(group, format, queryType);
				} catch (err) {
					log.error(`Background cron failed to update group "${group}" format "${format}": ${err}`);
				}
				// Stagger sequential fetches with a 1-3s random delay to avoid bursting Celestrak
				const interFetchDelay = 1000 + Math.floor(Math.random() * 2000);
				await new Promise((resolve) => setTimeout(resolve, interFetchDelay));
			}
		}
	}
}

function scheduleNextCheck(): void {
	const jitterMs = getRandomJitter(config.cronJitter);
	const nextDelayMs = config.cronInterval + jitterMs;
	log.debug(`Next TLE cron update check in ${(nextDelayMs / 1000).toFixed(0)}s (including ${(jitterMs / 1000).toFixed(0)}s random jitter).`);

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
	log.info(`Starting TLE background updater (interval: ${config.cronInterval / 1000}s, max jitter: ${config.cronJitter / 1000}s, max age: ${maxAgeDays} days).`);

	checkAndUpdateTles().catch((err) => {
		log.error(`Initial TLE background check error: ${err}`);
	});

	scheduleNextCheck();
}
