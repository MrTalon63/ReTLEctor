import tle from "tle";

import kv from "./kv";
import log from "./logger";
import config from "./config";
import fetchTle from "./tleFetcher";
import { version } from "../../package.json";

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
				const lines = allTles.split("\n");
				const setPromises: Promise<boolean>[] = [];
				for (let i = 0; i < lines.length; i += 3) {
					const idLine = lines[i + 0];
					const tleLine1 = lines[i + 1];
					const tleLine2 = lines[i + 2];

					if (idLine && tleLine1 && tleLine2) {
						const parsed = tle.parse(`${idLine}\n${tleLine1}\n${tleLine2}`);
						const tleString = `${idLine}\n${tleLine1}\n${tleLine2}`;
						if (parsed.number === noradId) {
							tleData = tleString;
						}
						setPromises.push(kv.set(`tle_${parsed.number}`, tleString));
						setPromises.push(kv.set(`tle_${parsed.number}_timestamp`, now));
					}
				}
				await Promise.all(setPromises);
			} else {
				log.error("No active TLEs available (fetch failed and no cache). Falling back to per-ID cache.");
			}
		} else {
			// Active group is still fresh — just scan for the requested satellite without re-writing everything
			log.debug(`Active TLE group is fresh. Scanning for NORAD ID ${noradId} without re-caching all satellites.`);
			const lines = allTles.split("\n");
			for (let i = 0; i < lines.length; i += 3) {
				const idLine = lines[i + 0];
				const tleLine1 = lines[i + 1];
				const tleLine2 = lines[i + 2];

				if (idLine && tleLine1 && tleLine2) {
					const parsed = tle.parse(`${idLine}\n${tleLine1}\n${tleLine2}`);
					if (parsed.number === noradId) {
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
		log.debug(`NORAD ID ${noradId} not found in active group. Attempting to fetch directly from Celestrak...`);
		const url = `https://celestrak.org/NORAD/elements/gp.php?CATNR=${noradId}&FORMAT=tle`;

		const cachedDirectData = (await kv.get(`tle_${noradId}`)) as string | null;

		try {
			let tries: number = (await kv.get(`celestrakTries`)) || 0;
			const lastTry: number | undefined = await kv.get(`celestrakLastTry`);

			// Reset the counters if more than an hour has passed since the last request
			if (lastTry && Date.now() - lastTry >= 60 * 60 * 1000) {
				tries = 0;
				await kv.set(`celestrakTries`, 0);
				await kv.set(`celestrakLastTry`, Date.now());
			}

			// We don't want to spam Celestrak with more than 25 requests per hour
			if (tries >= 25) {
				log.warn(`Celestrak rate limit reached. Falling back to stale cache for NORAD ID ${noradId}.`);
				if (cachedDirectData) return cachedDirectData;
				throw new Error("Rate limit exceeded for Celestrak fetches");
			}

			const response = await fetch(url, {
				headers: {
					"User-Agent": `ReTLEctor/${version} (https://github.com/MrTalon63/ReTLEctor)`,
				},
			});

			await kv.set(`celestrakTries`, tries + 1);
			await kv.set(`celestrakLastTry`, Date.now());

			if (!response.ok) {
				log.child({ status: response.status, statusText: response.statusText })
					.error(`Upstream returned ${response.status} for NORAD ID ${noradId}. Falling back to stale cache.`);
				if (cachedDirectData) return cachedDirectData;
				throw new Error(`Failed to fetch TLE from Celestrak: ${response.status} ${response.statusText}`);
			}

			const fetched = await response.text();
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
				log.child(error).error(`Error fetching TLE for NORAD ID ${noradId}:`);
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
