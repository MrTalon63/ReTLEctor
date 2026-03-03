import log from "./logger";
import kv from "./kv";

import { version } from "../../package.json";

async function fetchTle(group: string, format: "tle" | "json" | "csv" = "tle", queryType: string = "GROUP"): Promise<string> {
	const url = `https://celestrak.org/NORAD/elements/gp.php?${queryType}=${group}&FORMAT=${format}`;
	log.debug(`Fetching TLEs for group "${group}", format "${format}" from Celestrak...`);
	try {
		const lastFetch = await kv.get(`${group}_timestamp_${format}`);
		const response = await fetch(url, {
			headers: {
				"If-Modified-Since": lastFetch ? new Date(lastFetch).toUTCString() : "",
				"User-Agent": `ReTLEctor/${version} (https://github.com/MrTalon63/ReTLEctor)`,
			},
		});

		if (response.status === 304) {
			const cached = (await kv.get(`${group}_${format}`)) as string | null;
			if (cached) {
				log.debug(`Celestrak returned 304 for group "${group}", format "${format}". Serving cached data.`);
				return cached;
			}
			throw new Error(`Celestrak returned 304 but no cached data exists for group "${group}", format "${format}"`);
		}
		if (!response.ok) {
			throw new Error(`Failed to fetch TLEs: ${response.status} ${response.statusText}`);
		}
		const tleData = await response.text();

		await kv.set(`${group}_${format}`, tleData);
		await kv.set(`${group}_timestamp_${format}`, Date.now());
		log.debug(`Successfully cached TLEs for group "${group}" in format "${format}".`);
		return tleData;
	} catch (error) {
		if (error instanceof Error) {
			log.child(error).error(`Error fetching TLEs for group "${group}" in format "${format}":`);
		} else {
			log.error(`Error fetching TLEs for group "${group}" in format "${format}": ${error}`);
		}
		throw error;
	}
}

export default fetchTle;
