import log from "./logger";
import kv from "./kv";

import { version } from "../../package.json";

async function fetchTle(group: string) {
	const url = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=tle`;
	log.info(`Fetching TLEs for group "${group}" from Celestrak...`);
	try {
		const lastFetch = await kv.get(`${group}_timestamp`);
		const response = await fetch(url, {
			headers: {
				"If-Modified-Since": lastFetch ? new Date(lastFetch).toUTCString() : "",
				"User-Agent": `ReTLEctor/${version} (https://github.com/MrTalon63/ReTLEctor)`,
			},
		});
		if (!response.ok) {
			throw new Error(`Failed to fetch TLEs: ${response.status} ${response.statusText}`);
		}
		const tleData = await response.text();
		await kv.set(group, tleData);
		await kv.set(`${group}_timestamp`, Date.now());
		log.info(`Successfully cached TLEs for group "${group}".`);
		return tleData;
	} catch (error) {
		log.error(`Error fetching TLEs for group "${group}": ${error}`);
		throw error;
	}
}

export default fetchTle;
