import kv from "./kv";
import config from "./config";
import log from "./logger";
import fetchTle from "./tleFetcher";

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
			}
		}
	}
}

export function startTleCron(): void {
	const maxAgeDays = (config.maxStorageAge / (24 * 60 * 60 * 1000)).toFixed(1);
	log.info(`Starting TLE background updater (interval: ${config.cronInterval / 1000}s, max age: ${maxAgeDays} days).`);

	checkAndUpdateTles().catch((err) => {
		log.error(`Initial TLE background check error: ${err}`);
	});

	setInterval(() => {
		checkAndUpdateTles().catch((err) => {
			log.error(`Periodic TLE background check error: ${err}`);
		});
	}, config.cronInterval);
}
