import app from "./app";
import kv from "./utils/kv";
import config from "./utils/config";
import log from "./utils/logger";
import { startTleCron } from "./utils/tleCron";
import { isCorruptTleValue } from "./utils/tleFetcher";
import { isDerivedGroup } from "./utils/derivedGroup";

async function validateKvOnBootup(): Promise<void> {
	log.info("Validating KV store entries on bootup...");
	let purged = 0;

	for (const group of config.allowedGroups) {
		if (isDerivedGroup(group)) {
			continue;
		}

		const csvKey = `${group}_csv`;
		const csvTsKey = `${group}_timestamp_csv`;
		const csvValue = (await kv.get(csvKey)) as string | null;

		if (isCorruptTleValue(csvValue)) {
			if (csvValue !== null && csvValue !== undefined) {
				log.warn(
					`KV entry "${csvKey}" looks corrupt — purging (length=${csvValue?.length ?? 0}, preview="${csvValue?.slice(0, 60).replace(/\n/g, "\\n")}")`,
				);
				await kv.delete(csvKey);
				await kv.delete(csvTsKey);
				purged++;
			}
		}

		if (!csvValue) {
			for (const format of config.formats) {
				if (format === "csv") continue;
				const dataKey = `${group}_${format}`;
				const tsKey = `${group}_timestamp_${format}`;
				const value = (await kv.get(dataKey)) as string | null;
				if (value !== null && value !== undefined) {
					log.warn(`KV entry "${dataKey}" has no source CSV — purging stale derived cache.`);
					await kv.delete(dataKey);
					await kv.delete(tsKey);
					purged++;
				}
			}
		}
	}

	if (purged > 0) {
		log.warn(`KV validation complete. Purged ${purged} corrupt entr${purged === 1 ? "y" : "ies"}.`);
	} else {
		log.info("KV validation complete. No corrupt entries found.");
	}
}

await validateKvOnBootup();
startTleCron();

app.listen(config.port, () => {
	log.info(`Server is running on port ${config.port}`);
});
