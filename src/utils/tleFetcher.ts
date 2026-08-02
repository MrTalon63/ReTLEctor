import log from "./logger";
import kv from "./kv";

import config from "./config";

export function isCorruptTleValue(value: string | null | undefined): boolean {
	if (!value || value.trim().length === 0) return true;
	const trimmed = value.trim();
	// HTML error pages
	if (trimmed.startsWith("<") || trimmed.toLowerCase().startsWith("<!doctype")) return true;
	// Celestrak plain-text error messages
	if (trimmed.toLowerCase().startsWith("no gp data") || trimmed.toLowerCase().startsWith("no data")) return true;
	if (trimmed.toLowerCase().includes("error") && trimmed.length < 200) return true;
	return false;
}

async function fetchTle(group: string, format: "tle" | "json" | "csv" = "tle", queryType: string = "GROUP"): Promise<string> {
	const url = `${config.celestrakUrl}?${queryType}=${group}&FORMAT=${format}`;
	log.debug(`Fetching TLEs for group "${group}", format "${format}" from Celestrak...`);

	const cachedData = (await kv.get(`${group}_${format}`)) as string | null;

	try {
		const lastFetch = (await kv.get(`${group}_timestamp_${format}`)) as number | null;
		const headers: Record<string, string> = {
			"User-Agent": config.userAgent,
		};
		if (lastFetch) {
			headers["If-Modified-Since"] = new Date(lastFetch).toUTCString();
		}

		const response = await fetch(url, { headers });

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

		if (isCorruptTleValue(tleData)) {
			log.warn(`Upstream returned corrupt/error payload for group "${group}", format "${format}".`);
			if (cachedData) {
				log.warn(`Serving stale cached TLEs for group "${group}", format "${format}" due to corrupt payload.`);
				return cachedData;
			}
			throw new Error(`Upstream returned corrupt TLE payload for group "${group}"`);
		}

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
			log.error({ err: error }, `Error fetching TLEs for group "${group}" in format "${format}":`);
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
