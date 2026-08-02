import tle from "tle";

import kv from "./kv";
import log from "./logger";
import config from "./config";
import fetchTle, { isCorruptTleValue, isNotModifiedNotice } from "./tleFetcher";
import { isCelestrakLockedOut, triggerCelestrakLockout } from "./lockout";
import { version } from "../../package.json";

function extractNoradId(tleLine1: string): number | null {
	if (tleLine1 && tleLine1.startsWith("1 ")) {
		const num = parseInt(tleLine1.slice(2, 7).trim(), 10);
		if (!isNaN(num) && num > 0) return num;
	}
	return null;
}

async function getObjectsTle(noradId: number): Promise<string> {
	let tleData = (await kv.get(`tle_${noradId}`)) as string | null;
	const timestamp: number | undefined = await kv.get(`tle_${noradId}_timestamp`);
	const now = Date.now();
	const isStale = timestamp ? now - timestamp > config.cacheNoradDuration : true;

	// Only re-parse or re-fetch active group if per-ID cache is missing or stale
	if (!tleData || isStale) {
		let allTles = (await kv.get("active_tle")) as string | null;
		const activeTimestamp: number | undefined = await kv.get("active_timestamp_tle");
		const activeIsStale = activeTimestamp ? now - activeTimestamp > config.cacheActiveDuration : true;

		if (!allTles || activeIsStale) {
			// Active group is missing or stale — fetch fresh data and re-cache all satellites
			try {
				await fetchTle("active");
			} catch (err) {
				log.warn(`Failed to fetch active TLE group: ${err}`);
			}
			allTles = (await kv.get("active_tle")) as string | null;

			if (allTles) {
				const lines = allTles.trim().split(/\r?\n/);
				const BATCH_SIZE = config.kvBatchSize;
				let currentBatch: Promise<boolean>[] = [];

				for (let i = 0; i + 2 < lines.length; i += 3) {
					const idLine = lines[i + 0];
					const tleLine1 = lines[i + 1];
					const tleLine2 = lines[i + 2];

					if (idLine && tleLine1 && tleLine2) {
						let catNum = extractNoradId(tleLine1);
						if (!catNum) {
							try {
								const parsed = tle.parse(`${idLine}\n${tleLine1}\n${tleLine2}`);
								catNum = parsed.number;
							} catch {
								catNum = null;
							}
						}

						if (catNum) {
							const tleString = `${idLine}\n${tleLine1}\n${tleLine2}`;
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
				}
				if (currentBatch.length > 0) {
					await Promise.all(currentBatch);
				}
			} else {
				log.error("No active TLEs available (fetch failed and no cache). Falling back to per-ID cache.");
			}
		} else {
			// Active group is still fresh — scan for the requested satellite using fast string offset extraction
			log.debug(`Active TLE group is fresh. Scanning for NORAD ID ${noradId} without re-caching all satellites.`);
			const lines = allTles.trim().split(/\r?\n/);
			for (let i = 0; i + 2 < lines.length; i += 3) {
				const idLine = lines[i + 0];
				const tleLine1 = lines[i + 1];
				const tleLine2 = lines[i + 2];

				if (idLine && tleLine1 && tleLine2) {
					let catNum = extractNoradId(tleLine1);
					if (!catNum) {
						try {
							const parsed = tle.parse(`${idLine}\n${tleLine1}\n${tleLine2}`);
							catNum = parsed.number;
						} catch {
							catNum = null;
						}
					}

					if (catNum === noradId) {
						tleData = `${idLine}\n${tleLine1}\n${tleLine2}`;
						await kv.set(`tle_${noradId}`, tleData);
						await kv.set(`tle_${noradId}_timestamp`, now);
						break;
					}
				}
			}
		}
	}

	// Not in active group - try fetching directly from Celestrak by CATNR, with rate limiting
	if (!tleData) {
		const cachedDirectData = (await kv.get(`tle_${noradId}`)) as string | null;

		const lockout = await isCelestrakLockedOut();
		if (lockout.locked) {
			log.warn(`Celestrak is in 24-hour lockout (until ${lockout.untilIso}). Skipping direct fetch for NORAD ID ${noradId}.`);
			if (cachedDirectData) return cachedDirectData;
			throw new Error(`Celestrak is currently in 24-hour lockout until ${lockout.untilIso}`);
		}

		log.debug(`NORAD ID ${noradId} not found in active group. Attempting to fetch directly from Celestrak...`);
		const url = `${config.celestrakUrl}?CATNR=${noradId}&FORMAT=tle`;

		try {
			let tries: number = (await kv.get(`celestrakTries`)) || 0;
			let windowStart: number | undefined = await kv.get(`celestrakWindowStart`);

			// Reset the counter if 1 hour has passed since the start of the rate-limit window
			if (!windowStart || now - windowStart >= 60 * 60 * 1000) {
				tries = 0;
				windowStart = now;
				await kv.set(`celestrakTries`, 0);
				await kv.set(`celestrakWindowStart`, now);
			}

			// Maximum direct requests per hour to avoid spamming Celestrak
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
				log.child({ status: response.status, statusText: response.statusText })
					.error(`Upstream returned ${response.status} for NORAD ID ${noradId}. Falling back to stale cache.`);
				if (cachedDirectData) return cachedDirectData;
				throw new Error(`Failed to fetch TLE from Celestrak: ${response.status} ${response.statusText} (24h lockout engaged)`);
			}

			if (isCorruptTleValue(fetched)) {
				log.warn(`Upstream returned corrupt/error payload for NORAD ID ${noradId}.`);
				if (cachedDirectData) return cachedDirectData;
				throw new Error(`Upstream returned corrupt TLE payload for NORAD ID ${noradId}`);
			}

			tleData = fetched;
			await kv.set(`tle_${noradId}`, tleData);
			await kv.set(`tle_${noradId}_timestamp`, Date.now());
			log.debug(`Successfully fetched TLE for NORAD ID ${noradId} from Celestrak.`);
		} catch (error) {
			if (cachedDirectData) {
				log.warn(`Serving stale cached TLE for NORAD ID ${noradId} after fetch error.`);
				return cachedDirectData;
			}
			if (error instanceof Error) {
				log.error({ err: error }, `Error fetching TLE for NORAD ID ${noradId}:`);
			} else {
				log.error(`Error fetching TLE for NORAD ID ${noradId}: ${error}`);
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
