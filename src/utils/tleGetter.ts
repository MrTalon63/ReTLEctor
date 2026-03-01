import tle from "tle";

import kv from "./kv";
import log from "./logger";
import config from "./config";
import fetchTle from "./tleFetcher";
import { version } from "../../package.json";

async function getObjectsTle(noradId: number) {
	let tleData = (await kv.get(`tle_${noradId}`)) as string | null;
	let timestamp = await kv.get(`tle_${noradId}_timestamp`);
	const now = Date.now();
	const isStale = timestamp ? now - timestamp > config.cacheNoradDuration : true;

	if (!tleData || isStale) {
		let allTles = (await kv.get("active")) as string | null;
		if (!allTles) {
			await fetchTle("active");
		}
		allTles = (await kv.get("active")) as string | null;

		// If we still don't have the active TLEs then something went wrong with fetching, so we throw an error
		if (!allTles) {
			log.error("Failed to fetch active TLEs from Celestrak");
			throw new Error("Failed to fetch active TLEs from Celestrak");
		}
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
			}
		}
		await Promise.all(setPromises);
	}

	// If we're here then active group doesn't contain the requested NORAD ID, try fetching the TLE directly from Celestrak, but be aware of rate limits so we don't get blocked
	if (!tleData) {
		log.verbose(`NORAD ID ${noradId} not found in active group. Attempting to fetch directly from Celestrak...`);
		const url = `https://celestrak.org/NORAD/elements/gp.php?CATNR=${noradId}&FORMAT=tle`;
		try {
			let tries: number = (await kv.get(`celestrakTries`)) || 0;
			const lastTry: number | undefined = await kv.get(`celestrakLastTry`);

			// Reset the counters if more than an hour has passed since the last request
			if (lastTry && Date.now() - lastTry >= 60 * 60 * 1000) {
				tries = 0;
				await kv.set(`celestrakTries`, 0);
				await kv.set(`celestrakLastTry`, Date.now());
			}

			// We don't want to spam Celestrak with more than 20 requests per hour
			if (tries >= 20) {
				throw new Error("Rate limit exceeded for Celestrak fetches");
			}

			const response = await fetch(url, {
				// Celestrak doesn't support If-Modified-Since or ETag headers, so we have to implement our own rate limiting and caching mechanism to avoid getting blocked
				headers: {
					"User-Agent": `ReTLEctor/${version} (https://github.com/MrTalon63/ReTLEctor)`,
				},
			});

			if (!response.ok) {
				log.error(`Failed to fetch TLE from Celestrak: ${response.status} ${response.statusText}`);
				throw new Error(`Failed to fetch TLE from Celestrak`);
			}

			tleData = (await response.text()) as string;
			await kv.set(`tle_${noradId}`, tleData);
			await kv.set(`celestrakTries`, tries + 1);
			await kv.set(`celestrakLastTry`, Date.now());
			log.info(`Successfully fetched TLE for NORAD ID ${noradId} from Celestrak.`);
		} catch (error) {
			log.error(`Error fetching TLE for NORAD ID ${noradId}: ${error}`);
			throw error;
		}
	}

	return tleData;
}

export default getObjectsTle;
