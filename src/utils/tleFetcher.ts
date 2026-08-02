import log from "./logger";
import kv from "./kv";
import config from "./config";
import { isCelestrakLockedOut, triggerCelestrakLockout } from "./lockout";

export function isNotModifiedNotice(value: string | null | undefined): boolean {
	if (!value) return false;
	const lower = value.trim().toLowerCase();
	return (
		lower.includes("gp data has not updated") ||
		lower.includes("has not updated since") ||
		lower.includes("data is updated once every")
	);
}

export function isCorruptTleValue(value: string | null | undefined): boolean {
	if (!value || value.trim().length === 0) return true;
	const trimmed = value.trim();
	const lower = trimmed.toLowerCase();

	// HTML error pages
	if (trimmed.startsWith("<") || lower.startsWith("<!doctype") || lower.startsWith("<html")) return true;

	// Celestrak plain-text error messages & "not updated" notices
	if (
		isNotModifiedNotice(trimmed) ||
		lower.includes("no gp data") ||
		lower.includes("no data") ||
		lower.includes("rate limit") ||
		lower.includes("exceeded") ||
		(lower.includes("error") && trimmed.length < 300)
	) {
		return true;
	}

	return false;
}

async function fetchTle(group: string, format: "tle" | "json" | "csv" = "tle", queryType: string = "GROUP"): Promise<string> {
	const cachedData = (await kv.get(`${group}_${format}`)) as string | null;

	const lockout = await isCelestrakLockedOut();
	if (lockout.locked) {
		log.warn(`Celestrak is currently in 24-hour lockout (until ${lockout.untilIso}). Skipping HTTP fetch for group "${group}", format "${format}".`);
		if (cachedData) {
			return cachedData;
		}
		throw new Error(`Celestrak is currently in 24-hour lockout until ${lockout.untilIso}`);
	}

	const url = `${config.celestrakUrl}?${queryType}=${group}&FORMAT=${format}`;
	log.debug(`Fetching TLEs for group "${group}", format "${format}" from Celestrak...`);

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

		const tleData = await response.text();

		// Handle Celestrak plain-text notice ("GP data has not updated..."), which CelesTrak sends with 200 OK, 403 Forbidden, or 429 Too Many Requests
		if (isNotModifiedNotice(tleData)) {
			log.info(
				`Celestrak reported GP data for group "${group}", format "${format}" has not updated (HTTP ${response.status}). Refreshing cache timestamp and serving cached data.`
			);
			await kv.set(`${group}_timestamp_${format}`, Date.now());
			if (!response.ok) {
				await triggerCelestrakLockout(response.status, `group "${group}" format "${format}" (403/429 not-modified notice)`);
			}
			if (cachedData) {
				return cachedData;
			}
			throw new Error(`Celestrak reported data not updated (HTTP ${response.status}), but no cached data exists for group "${group}"`);
		}

		if (!response.ok) {
			await triggerCelestrakLockout(response.status, `group "${group}" format "${format}"`);
			if (cachedData) {
				log.warn(`Serving stale cached TLEs for group "${group}", format "${format}" due to non-200 response (${response.status}).`);
				return cachedData;
			}
			throw new Error(`Failed to fetch TLEs: ${response.status} ${response.statusText} (24h lockout engaged)`);
		}

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
		if (cachedData && error instanceof Error && error.message.includes("(24h lockout engaged)")) {
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
