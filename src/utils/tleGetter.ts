import kv from "./kv";
import log from "./logger";
import config from "./config";
import fetchTle, { isCorruptTleValue, isNotModifiedNotice } from "./tleFetcher";
import { isCelestrakLockedOut, triggerCelestrakLockout, formatLockoutDuration } from "./lockout";
import { decode as decodeAlpha5 } from "./alpha5";
import { parseOmmCsv, csvTo3le, csvToJson, csvToKvn, recordsToCsv, type OmmRecord } from "./omm";

export type OrbitFormat = "tle" | "json" | "csv" | "kvn";

export function normalizeOrbitFormat(rawFormat?: string): OrbitFormat {
	if (!rawFormat) return "csv";
	const lower = rawFormat.toLowerCase().split(".")[0]?.trim();
	if (lower === "3le" || lower === "tle") return "tle";
	if (lower === "json") return "json";
	if (lower === "kvn") return "kvn";
	return "csv";
}

export function isValidOrbitFormat(rawFormat?: string): boolean {
	if (!rawFormat) return true;
	const lower = rawFormat.toLowerCase().split(".")[0]?.trim();
	return lower === "csv" || lower === "json" || lower === "tle" || lower === "3le" || lower === "kvn";
}

export interface NoradResult {
	data: string;
	contentType: string;
	timestamp: number;
}

export async function getNoradCsv(noradId: number): Promise<{ csv: string; record?: OmmRecord; timestamp: number }> {
	let cachedCsv = (await kv.get(`norad_${noradId}_csv`)) as string | null;
	let timestamp: number | undefined = await kv.get(`norad_${noradId}_timestamp`);
	const now = Date.now();
	const isStale = timestamp ? now - timestamp > config.cacheNoradDuration : true;

	if (!cachedCsv || isStale) {
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
		}

		if (activeCsv) {
			const records = parseOmmCsv(activeCsv);
			const found = records.find((rec) => rec.NORAD_CAT_ID === noradId);
			if (found) {
				const singleCsv = recordsToCsv([found]);
				await kv.set(`norad_${noradId}_csv`, singleCsv);
				await kv.set(`norad_${noradId}_timestamp`, now);
				return { csv: singleCsv, record: found, timestamp: now };
			}
		}
	} else if (cachedCsv && !isStale && timestamp) {
		return { csv: cachedCsv, timestamp };
	}

	// Not found in active group or active cache unavailable — attempt direct Celestrak fetch
	const cachedDirectData = (await kv.get(`norad_${noradId}_csv`)) as string | null;
	const directTimestamp = ((await kv.get(`norad_${noradId}_timestamp`)) as number | undefined) || now;

	const lockout = await isCelestrakLockedOut();
	if (lockout.locked) {
		log.warn(
			`Celestrak is in ${formatLockoutDuration()} lockout (until ${lockout.untilIso}). Skipping direct fetch for NORAD ID ${noradId}.`,
		);
		if (cachedDirectData) return { csv: cachedDirectData, timestamp: directTimestamp };
		throw new Error(`Celestrak is currently in ${formatLockoutDuration()} lockout until ${lockout.untilIso}`);
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
			if (cachedDirectData) return { csv: cachedDirectData, timestamp: directTimestamp };
			throw new Error("Rate limit exceeded for Celestrak fetches");
		}

		const response = await fetch(url, {
			headers: {
				"User-Agent": config.userAgent,
			},
		});

		await kv.set(`celestrakTries`, tries + 1);

		if (response.status === 404) {
			log.info(`Celestrak returned 404 for NORAD ID ${noradId}.`);
			const err = new Error(`No orbital data found for NORAD ID ${noradId}`);
			(err as any).statusCode = 404;
			throw err;
		}

		const fetched = await response.text();

		if (isNotModifiedNotice(fetched)) {
			log.info(`Celestrak reported data for NORAD ID ${noradId} has not updated (HTTP ${response.status}). Serving cached data.`);
			if (!response.ok && response.status !== 404) {
				await triggerCelestrakLockout(response.status, `NORAD ID ${noradId} (403/429 notice)`);
			}
			if (cachedDirectData) return { csv: cachedDirectData, timestamp: directTimestamp };
		}

		if (!response.ok) {
			await triggerCelestrakLockout(response.status, `NORAD ID ${noradId}`);
			log.child({ status: response.status, statusText: response.statusText }).error(
				`Upstream returned ${response.status} for NORAD ID ${noradId}. Falling back to stale cache.`,
			);
			if (cachedDirectData) return { csv: cachedDirectData, timestamp: directTimestamp };
			throw new Error(`Failed to fetch GP data from Celestrak: ${response.status} ${response.statusText}`);
		}

		if (isCorruptTleValue(fetched)) {
			if (fetched.toLowerCase().includes("no gp data") || fetched.toLowerCase().includes("no data")) {
				log.info(`Celestrak reported no data for NORAD ID ${noradId}.`);
				const err = new Error(`No orbital data found for NORAD ID ${noradId}`);
				(err as any).statusCode = 404;
				throw err;
			}
			log.warn(`Upstream returned corrupt/error payload for NORAD ID ${noradId}.`);
			if (cachedDirectData) return { csv: cachedDirectData, timestamp: directTimestamp };
			throw new Error(`Upstream returned corrupt GP payload for NORAD ID ${noradId}`);
		}

		const parsedRecords = parseOmmCsv(fetched);
		if (parsedRecords.length === 0) {
			const err = new Error(`No orbital data found for NORAD ID ${noradId}`);
			(err as any).statusCode = 404;
			throw err;
		}

		const cleanCsv = recordsToCsv(parsedRecords);
		await kv.set(`norad_${noradId}_csv`, cleanCsv);
		await kv.set(`norad_${noradId}_timestamp`, Date.now());
		log.debug(`Successfully fetched GP data for NORAD ID ${noradId} from Celestrak.`);
		return { csv: cleanCsv, record: parsedRecords[0], timestamp: Date.now() };
	} catch (error) {
		if ((error as any)?.statusCode === 404 || (error instanceof Error && error.message.includes("No orbital data found"))) {
			throw error;
		}
		if (cachedDirectData) {
			log.warn(`Serving stale cached data for NORAD ID ${noradId} after fetch error.`);
			return { csv: cachedDirectData, timestamp: directTimestamp };
		}
		if (error instanceof Error) {
			log.error({ err: error }, `Error fetching GP data for NORAD ID ${noradId}:`);
		} else {
			log.error(`Error fetching GP data for NORAD ID ${noradId}: ${error}`);
		}
		throw error;
	}
}

export async function getNoradData(noradId: number, format: OrbitFormat): Promise<NoradResult> {
	const { csv, timestamp } = await getNoradCsv(noradId);

	if (format === "json") {
		return {
			data: csvToJson(csv),
			contentType: "application/json",
			timestamp,
		};
	}

	if (format === "kvn") {
		return {
			data: csvToKvn(csv),
			contentType: "text/plain",
			timestamp,
		};
	}

	if (format === "csv") {
		return {
			data: csv,
			contentType: "text/plain",
			timestamp,
		};
	}

	// Default: "tle" / 3LE
	return {
		data: csvTo3le(csv),
		contentType: "text/plain",
		timestamp,
	};
}

export async function handleNoradRequest(idParam: string, format: OrbitFormat): Promise<Response> {
	const cleanId = idParam.split(".")[0]?.trim() || "";
	let noradId: number;
	try {
		noradId = decodeAlpha5(cleanId.toUpperCase());
	} catch {
		return new Response("Invalid NORAD ID.", { status: 400 });
	}
	if (isNaN(noradId) || noradId <= 0) {
		return new Response("Invalid NORAD ID.", { status: 400 });
	}

	try {
		const { data, contentType, timestamp } = await getNoradData(noradId, format);
		const age = Date.now() - timestamp;
		const maxAge = Math.max(0, Math.ceil((config.cacheNoradDuration - age) / 1000));
		return new Response(data, {
			status: 200,
			headers: {
				"Content-Type": contentType,
				"Cache-Control": `max-age=${maxAge}`,
				"Last-Modified": new Date(timestamp).toUTCString(),
			},
		});
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		if ((error as any)?.statusCode === 404 || msg.includes("No orbital data found") || msg.includes("No TLE data found") || msg.includes("404")) {
			return new Response(`No orbital data found for NORAD ID ${noradId}.`, {
				status: 404,
				headers: { "Content-Type": "text/plain" },
			});
		}
		log.error({ err: error }, `Failed to serve NORAD ID ${noradId} (format: ${format})`);
		return new Response("Failed to retrieve orbital data. Upstream may be unavailable.", {
			status: 503,
			headers: { "Content-Type": "text/plain" },
		});
	}
}

async function getObjectsTle(noradId: number): Promise<string> {
	const res = await getNoradData(noradId, "tle");
	return res.data;
}

export default getObjectsTle;
