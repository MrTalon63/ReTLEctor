import log from "./logger";
import kv from "./kv";

import { version } from "../../package.json";

async function fetchTle(group: string, format: "tle" | "json" | "csv" = "tle", queryType: string = "GROUP"): Promise<string> {
	const url = `https://celestrak.org/NORAD/elements/gp.php?${queryType}=${group}&FORMAT=${format}`;
	log.debug(`Fetching TLEs for group "${group}", format "${format}" from Celestrak...`);

	const cachedData = (await kv.get(`${group}_${format}`)) as string | null;

	try {
		const lastFetch = await kv.get(`${group}_timestamp_${format}`);
		const response = await fetch(url, {
			headers: {
				"If-Modified-Since": lastFetch ? new Date(lastFetch).toUTCString() : "",
				"User-Agent": `ReTLEctor/${version} (https://github.com/MrTalon63/ReTLEctor)`,
			},
		});

		if (response.status === 304) {
			log.debug(`TLEs for group "${group}", format "${format}" not modified (304). Serving cached data.`);
			if (cachedData) return cachedData;
			throw new Error(`Got 304 but no cached data for group "${group}", format "${format}"`);
		}
		if (!response.ok) {
			log.child({ status: response.status, statusText: response.statusText })
				.error(`Upstream returned ${response.status} for group "${group}", format "${format}". Will serve cached data if available.`);

			if (cachedData) {
				log.warn(`Serving stale cached TLEs for group "${group}", format "${format}" due to upstream error.`);
				return cachedData;
			}
			throw new Error(`Failed to fetch TLEs: ${response.status} ${response.statusText}`);
		}

		const tleData = await response.text();

		await kv.set(`${group}_${format}`, tleData);
		await kv.set(`${group}_timestamp_${format}`, Date.now());
		log.debug(`Successfully cached TLEs for group "${group}" in format "${format}".`);
		return tleData;
	} catch (error) {
		if (cachedData && error instanceof Error && error.message.startsWith("Failed to fetch TLEs:")) {
			// Already logged above, cachedData fallback returned — shouldn't reach here normally
			return cachedData;
		}
		if (error instanceof Error) {
			log.child(error).error(`Error fetching TLEs for group "${group}" in format "${format}":`);
		} else {
			log.error(`Error fetching TLEs for group "${group}" in format "${format}": ${error}`);
		}
		if (cachedData) {
			log.warn(`Serving stale cached TLEs for group "${group}", format "${format}" after fetch error.`);
			return cachedData;
		}
		throw error;
	}
}

export default fetchTle;
