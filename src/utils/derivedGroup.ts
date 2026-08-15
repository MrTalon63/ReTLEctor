import kv from "./kv";
import config from "./config";
import log from "./logger";
import { parseOmmCsv, filterRecordsToCsv, csvTo3le, csvToJson, csvToKvn } from "./omm";

export function isDerivedGroup(group: string): boolean {
	return group in config.derivedGroups;
}

export function getSourceGroup(group: string): string | null {
	const def = (config.derivedGroups as Record<string, { source: string; filter: (name: string) => boolean }>)[group];
	return def ? def.source : null;
}

export async function getDerivedGroupFormat(group: string, format: "tle" | "json" | "csv" | "kvn"): Promise<string> {
	const def = (config.derivedGroups as Record<string, { source: string; filter: (name: string) => boolean }>)[group];
	if (!def) {
		throw new Error(`Unknown derived group: ${group}`);
	}

	const sourceGroup = def.source;
	const sourceCsv = (await kv.get(`${sourceGroup}_csv`)) as string | null;

	if (!sourceCsv) {
		throw new Error(`Source group "${sourceGroup}" has no cached CSV data for derived group "${group}"`);
	}

	const records = parseOmmCsv(sourceCsv);
	const filteredCsv = filterRecordsToCsv(records, (rec) => def.filter(rec.OBJECT_NAME));

	switch (format) {
		case "tle":
			return csvTo3le(filteredCsv);
		case "json":
			return csvToJson(filteredCsv);
		case "kvn":
			return csvToKvn(filteredCsv);
		case "csv":
			return filteredCsv;
		default:
			return filteredCsv;
	}
}

export async function getDerivedGroupTimestamp(group: string): Promise<number | null> {
	const sourceGroup = getSourceGroup(group);
	if (!sourceGroup) return null;
	return (await kv.get(`${sourceGroup}_timestamp_csv`)) as number | null;
}

export default {
	isDerivedGroup,
	getSourceGroup,
	getDerivedGroupFormat,
	getDerivedGroupTimestamp,
};
