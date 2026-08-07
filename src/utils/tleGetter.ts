import kv from "./kv";
import log from "./logger";
import config from "./config";
import fetchTle, { isCorruptTleValue, isNotModifiedNotice } from "./tleFetcher";
import { isCelestrakLockedOut, triggerCelestrakLockout } from "./lockout";
import { parseOmmCsv, csvTo3le } from "./omm";

async function getObjectsTle(noradId: number): Promise<string> {
	let tleData = (await kv.get(`tle_${noradId}`)) as string | null;
	const timestamp: number | undefined = await kv.get(`tle_${noradId}_timestamp`);
	const now = Date.now();
	const isStale = timestamp ? now - timestamp > config.cacheNoradDuration : true;

	if (!tleData || isStale) {
		let activeCsv = (await kv.get("active_csv")) as string | null;
		const activeTimestamp: number | undefined = await kv.get("active_timestamp_csv");
		const activeIsStale = activeTimestamp ? now - activeTimestamp > config.cacheActiveDuration : true;

		if (!activeCsv || activeIsStale) {
			try {
				await fetchTle("active", "csv");
			} catch (err) {
				log.warn(`Failed to fetch active GP group: ${err}`);
			}
			activeCsv = (await kv.get("active_csv")) as string | null;

			if (activeCsv) {
				const records = parseOmmCsv(activeCsv);
				const BATCH_SIZE = config.kvBatchSize;
				let currentBatch: Promise<boolean>[] = [];

				for (const rec of records) {
					const catNum = rec.NORAD_CAT_ID;
					if (catNum > 0) {
						const tleString = csvTo3le(JSON.stringify([rec]));
						if (catNum === noradId) {
							tleData = tleString;
						}
						currentBatch.push(kv.set(`tle_${catNum}`, tleString));
						currentBatch.push(kv.set(`tle_${catNum}_timestamp`, now));

						if (currentBatch.length >= BATCH_SIZE) {
							await Promise.all(currentBatch);
							currentBatch = [];
						}
					}
				}
				if (currentBatch.length > 0) {
					await Promise.all(currentBatch);
				}
			} else {
				log.error("No active GP data available (fetch failed and no cache). Falling back to per-ID cache.");
			}
		} else {
			log.debug(`Active GP data is fresh. Scanning for NORAD ID ${noradId} without re-caching all satellites.`);
			const records = parseOmmCsv(activeCsv);

			for (const rec of records) {
				if (rec.NORAD_CAT_ID === noradId) {
					tleData = csvTo3le(JSON.stringify([rec]));
					await kv.set(`tle_${noradId}`, tleData);
					await kv.set(`tle_${noradId}_timestamp`, now);
					break;
				}
			}
		}
	}

	if (!tleData) {
		const cachedDirectData = (await kv.get(`tle_${noradId}`)) as string | null;

		const lockout = await isCelestrakLockedOut();
		if (lockout.locked) {
			log.warn(`Celestrak is in 24-hour lockout (until ${lockout.untilIso}). Skipping direct fetch for NORAD ID ${noradId}.`);
			if (cachedDirectData) return cachedDirectData;
			throw new Error(`Celestrak is currently in 24-hour lockout until ${lockout.untilIso}`);
		}

		log.debug(`NORAD ID ${noradId} not found in active group. Attempting to fetch directly from Celestrak...`);

		const url = `${config.celestrakUrl}?CATNR=${noradId}&FORMAT=csv`;

		try {
			let tries: number = (await kv.get(`celestrakTries`)) || 0;
			let windowStart: number | undefined = await kv.get(`celestrakWindowStart`);

			if (!windowStart || now - windowStart >= 60 * 60 * 1000) {
				tries = 0;
				windowStart = now;
				await kv.set(`celestrakTries`, 0);
				await kv.set(`celestrakWindowStart`, now);
			}

			if (tries >= config.celestrakMaxDirectRequests) {
				log.warn(`Celestrak rate limit reached. Falling back to stale cache for NORAD ID ${noradId}.`);
				if (cachedDirectData) return cachedDirectData;
				throw new Error("Rate limit exceeded for Celestrak fetches");
			}

			const response = await fetch(url, {
				headers: {
					"User-Agent": config.userAgent,
				},
			});

			await kv.set(`celestrakTries`, tries + 1);

			const fetched = await response.text();

			if (isNotModifiedNotice(fetched)) {
				log.info(`Celestrak reported data for NORAD ID ${noradId} has not updated (HTTP ${response.status}). Serving cached data.`);
				if (!response.ok) {
					await triggerCelestrakLockout(response.status, `NORAD ID ${noradId} (403/429 notice)`);
				}
				if (cachedDirectData) return cachedDirectData;
			}

			if (!response.ok) {
				await triggerCelestrakLockout(response.status, `NORAD ID ${noradId}`);
				log.child({ status: response.status, statusText: response.statusText }).error(
					`Upstream returned ${response.status} for NORAD ID ${noradId}. Falling back to stale cache.`,
				);
				if (cachedDirectData) return cachedDirectData;
				throw new Error(`Failed to fetch GP data from Celestrak: ${response.status} ${response.statusText} (24h lockout engaged)`);
			}

			if (isCorruptTleValue(fetched)) {
				log.warn(`Upstream returned corrupt/error payload for NORAD ID ${noradId}.`);
				if (cachedDirectData) return cachedDirectData;
				throw new Error(`Upstream returned corrupt GP payload for NORAD ID ${noradId}`);
			}

			tleData = csvTo3le(fetched);
			await kv.set(`tle_${noradId}`, tleData);
			await kv.set(`tle_${noradId}_timestamp`, Date.now());
			log.debug(`Successfully fetched GP data for NORAD ID ${noradId} from Celestrak.`);
		} catch (error) {
			if (cachedDirectData) {
				log.warn(`Serving stale cached TLE for NORAD ID ${noradId} after fetch error.`);
				return cachedDirectData;
			}
			if (error instanceof Error) {
				log.error({ err: error }, `Error fetching GP data for NORAD ID ${noradId}:`);
			} else {
				log.error(`Error fetching GP data for NORAD ID ${noradId}: ${error}`);
			}
			throw error;
		}
	}

	if (!tleData) {
		throw new Error(`No TLE data found for NORAD ID ${noradId}`);
	}

	return tleData;
}

export default getObjectsTle;
