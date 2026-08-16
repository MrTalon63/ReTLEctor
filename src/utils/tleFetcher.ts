import log from "./logger";
import kv from "./kv";
import config from "./config";
import { isCelestrakLockedOut, triggerCelestrakLockout, formatLockoutDuration } from "./lockout";
import { csvTo3le, csvToJson, csvToKvn, parseOmmCsv } from "./omm";

import type { OrbitFormat } from "./tleGetter";

export function isNotModifiedNotice(value: string | null | undefined): boolean {
	if (!value) return false;
	const lower = value.trim().toLowerCase();
	return (
		lower.includes("gp data has not updated") || lower.includes("has not updated since") || lower.includes("data is updated once every")
	);
}

export function isCorruptTleValue(value: string | null | undefined): boolean {
	if (!value || value.trim().length === 0) return true;
	const trimmed = value.trim();
	const lower = trimmed.toLowerCase();

	if (trimmed.startsWith("<") || lower.startsWith("<!doctype") || lower.startsWith("<html")) return true;

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

async function fetchTle(group: string, format: OrbitFormat = "tle", queryType: string = "GROUP"): Promise<string> {
	const upstreamFormat = "csv";
	const cachedCsv = (await kv.get(`${group}_${upstreamFormat}`)) as string | null;

	const lockout = await isCelestrakLockedOut();
	if (lockout.locked) {
		log.warn(
			`Celestrak is currently in ${formatLockoutDuration()} lockout (until ${lockout.untilIso}). Skipping HTTP fetch for group "${group}".`,
		);
		if (cachedCsv) {
			return deriveFormat(cachedCsv, format);
		}
		throw new Error(`Celestrak is currently in ${formatLockoutDuration()} lockout until ${lockout.untilIso}`);
	}

	const url = `${config.celestrakUrl}?${queryType}=${group}&FORMAT=${upstreamFormat}`;
	log.debug(`Fetching orbital data for group "${group}" in CSV format from Celestrak...`);

	try {
		const lastFetch = (await kv.get(`${group}_timestamp_${upstreamFormat}`)) as number | null;
		const headers: Record<string, string> = {
			"User-Agent": config.userAgent,
		};
		if (lastFetch) {
			headers["If-Modified-Since"] = new Date(lastFetch).toUTCString();
		}

		const response = await fetch(url, { headers });

		if (response.status === 304) {
			log.debug(`Orbital data for group "${group}" not modified (304). Serving cached data.`);
			if (cachedCsv) return deriveFormat(cachedCsv, format);
			throw new Error(`Got 304 but no cached data for group "${group}"`);
		}

		if (response.status === 404) {
			log.warn(`Celestrak returned 404 Not Found for group "${group}".`);
			const notFoundError = new Error(`Group "${group}" not found on upstream Celestrak (404)`);
			(notFoundError as any).statusCode = 404;
			throw notFoundError;
		}

		const csvData = await response.text();

		if (isNotModifiedNotice(csvData)) {
			log.info(
				`Celestrak reported orbital data for group "${group}" has not updated (HTTP ${response.status}). Refreshing cache timestamp and serving cached data.`,
			);
			await kv.set(`${group}_timestamp_${upstreamFormat}`, Date.now());
			if (!response.ok && response.status !== 404) {
				await triggerCelestrakLockout(response.status, `group "${group}" (403/429 not-modified notice)`);
			}
			if (cachedCsv) {
				return deriveFormat(cachedCsv, format);
			}
			throw new Error(
				`Celestrak reported data not updated (HTTP ${response.status}), but no cached data exists for group "${group}"`,
			);
		}

		if (!response.ok) {
			await triggerCelestrakLockout(response.status, `group "${group}"`);
			if (cachedCsv) {
				log.warn(`Serving stale cached orbital data for group "${group}" due to non-200 response (${response.status}).`);
				return deriveFormat(cachedCsv, format);
			}
			throw new Error(
				`Failed to fetch orbital data: ${response.status} ${response.statusText} (${formatLockoutDuration()} lockout engaged)`,
			);
		}

		if (isCorruptTleValue(csvData)) {
			log.warn(`Upstream returned corrupt/error payload for group "${group}".`);
			if (cachedCsv) {
				log.warn(`Serving stale cached orbital data for group "${group}" due to corrupt payload.`);
				return deriveFormat(cachedCsv, format);
			}
			throw new Error(`Upstream returned corrupt orbital payload for group "${group}"`);
		}

		try {
			parseOmmCsv(csvData);
		} catch (e) {
			log.warn(`Upstream returned unparseable CSV for group "${group}": ${e}`);
			if (cachedCsv) {
				log.warn(`Serving stale cached orbital data for group "${group}" due to unparseable CSV.`);
				return deriveFormat(cachedCsv, format);
			}
			throw new Error(`Upstream returned unparseable CSV for group "${group}"`);
		}

		await kv.set(`${group}_${upstreamFormat}`, csvData);
		await kv.set(`${group}_timestamp_${upstreamFormat}`, Date.now());

		const tleData = csvTo3le(csvData);
		const jsonData = csvToJson(csvData);
		const kvnData = csvToKvn(csvData);

		await kv.set(`${group}_tle`, tleData);
		await kv.set(`${group}_json`, jsonData);
		await kv.set(`${group}_kvn`, kvnData);
		await kv.set(`${group}_timestamp_tle`, Date.now());
		await kv.set(`${group}_timestamp_json`, Date.now());
		await kv.set(`${group}_timestamp_kvn`, Date.now());

		log.debug(`Successfully cached orbital data for group "${group}" (CSV + derived 3LE/JSON/KVN).`);

		return deriveFormat(csvData, format);
	} catch (error) {
		if ((error as any)?.statusCode === 404 || (error instanceof Error && error.message.includes("(404)"))) {
			throw error;
		}
		if (cachedCsv && error instanceof Error && error.message.includes("lockout engaged")) {
			return deriveFormat(cachedCsv, format);
		}
		if (error instanceof Error) {
			log.error({ err: error }, `Error fetching orbital data for group "${group}":`);
		} else {
			log.error(`Error fetching orbital data for group "${group}": ${error}`);
		}
		if (cachedCsv) {
			log.warn(`Serving stale cached orbital data for group "${group}" after fetch error.`);
			return deriveFormat(cachedCsv, format);
		}
		throw error;
	}
}

function deriveFormat(csvData: string, format: "tle" | "json" | "csv" | "kvn"): string {
	switch (format) {
		case "tle":
			return csvTo3le(csvData);
		case "json":
			return csvToJson(csvData);
		case "kvn":
			return csvToKvn(csvData);
		case "csv":
			return csvData;
		default:
			return csvData;
	}
}

export default fetchTle;
