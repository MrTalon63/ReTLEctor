import { encode as encodeAlpha5, decode as decodeAlpha5 } from "./alpha5";

export const OMM_CSV_COLUMNS = [
	"OBJECT_NAME",
	"OBJECT_ID",
	"EPOCH",
	"MEAN_MOTION",
	"ECCENTRICITY",
	"INCLINATION",
	"RA_OF_ASC_NODE",
	"ARG_OF_PERICENTER",
	"MEAN_ANOMALY",
	"EPHEMERIS_TYPE",
	"CLASSIFICATION_TYPE",
	"NORAD_CAT_ID",
	"ELEMENT_SET_NO",
	"REV_AT_EPOCH",
	"BSTAR",
	"MEAN_MOTION_DOT",
	"MEAN_MOTION_DDOT",
] as const;

export interface OmmRecord {
	OBJECT_NAME: string;
	OBJECT_ID: string;
	EPOCH: string;
	MEAN_MOTION: number;
	ECCENTRICITY: number;
	INCLINATION: number;
	RA_OF_ASC_NODE: number;
	ARG_OF_PERICENTER: number;
	MEAN_ANOMALY: number;
	EPHEMERIS_TYPE: number;
	CLASSIFICATION_TYPE: string;
	NORAD_CAT_ID: number;
	ELEMENT_SET_NO: number;
	REV_AT_EPOCH: number;
	BSTAR: number;
	MEAN_MOTION_DOT: number;
	MEAN_MOTION_DDOT: number;
}

export function parseOmmCsv(csvText: string): OmmRecord[] {
	const lines = csvText.trim().split(/\r?\n/);
	if (lines.length < 2) return [];

	const header = parseCsvLine(lines[0] ?? "");
	const colIndex: Record<string, number> = {};
	header.forEach((col, i) => {
		colIndex[col.trim().toUpperCase()] = i;
	});

	const records: OmmRecord[] = [];

	for (let i = 1; i < lines.length; i++) {
		const line = (lines[i] ?? "").trim();
		if (!line) continue;

		const fields = parseCsvLine(line);
		const record: OmmRecord = {
			OBJECT_NAME: getField(fields, colIndex, "OBJECT_NAME", ""),
			OBJECT_ID: getField(fields, colIndex, "OBJECT_ID", ""),
			EPOCH: getField(fields, colIndex, "EPOCH", ""),
			MEAN_MOTION: getNumber(fields, colIndex, "MEAN_MOTION"),
			ECCENTRICITY: getNumber(fields, colIndex, "ECCENTRICITY"),
			INCLINATION: getNumber(fields, colIndex, "INCLINATION"),
			RA_OF_ASC_NODE: getNumber(fields, colIndex, "RA_OF_ASC_NODE"),
			ARG_OF_PERICENTER: getNumber(fields, colIndex, "ARG_OF_PERICENTER"),
			MEAN_ANOMALY: getNumber(fields, colIndex, "MEAN_ANOMALY"),
			EPHEMERIS_TYPE: getNumber(fields, colIndex, "EPHEMERIS_TYPE"),
			CLASSIFICATION_TYPE: getField(fields, colIndex, "CLASSIFICATION_TYPE", "U"),
			NORAD_CAT_ID: getNumber(fields, colIndex, "NORAD_CAT_ID"),
			ELEMENT_SET_NO: getNumber(fields, colIndex, "ELEMENT_SET_NO"),
			REV_AT_EPOCH: getNumber(fields, colIndex, "REV_AT_EPOCH"),
			BSTAR: getNumber(fields, colIndex, "BSTAR"),
			MEAN_MOTION_DOT: getNumber(fields, colIndex, "MEAN_MOTION_DOT"),
			MEAN_MOTION_DDOT: getNumber(fields, colIndex, "MEAN_MOTION_DDOT"),
		};
		records.push(record);
	}

	return records;
}

function getField(fields: string[], colIndex: Record<string, number>, colName: string, fallback: string): string {
	const idx = colIndex[colName];
	if (idx === undefined || idx >= fields.length) return fallback;
	return fields[idx] ?? fallback;
}

function getNumber(fields: string[], colIndex: Record<string, number>, colName: string): number {
	const idx = colIndex[colName];
	if (idx === undefined || idx >= fields.length) return 0;
	const val = fields[idx];
	if (val === undefined || val === null || val === "") return 0;
	const num = parseFloat(val);
	return isNaN(num) ? 0 : num;
}

function convertIntDesig(objectId: string): string {
	if (!objectId) return "          ";
	const trimmed = objectId.trim();

	const match = trimmed.match(/^(\d{4})-(\d{3})(.*)$/);
	if (match) {
		const year = (match[1] ?? "").slice(-2);
		const launchNum = match[2] ?? "";
		const piece = match[3] || "";
		return (year + launchNum + piece).padEnd(8);
	}

	return trimmed.padEnd(8);
}

function parseCsvLine(line: string): string[] {
	const result: string[] = [];
	let current = "";
	let inQuotes = false;

	for (let i = 0; i < line.length; i++) {
		const char = line[i];

		if (inQuotes) {
			if (char === '"') {
				if (line[i + 1] === '"') {
					current += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				current += char;
			}
		} else {
			if (char === '"') {
				inQuotes = true;
			} else if (char === ",") {
				result.push(current);
				current = "";
			} else {
				current += char;
			}
		}
	}
	result.push(current);
	return result;
}

export function csvToJson(csvText: string): string {
	const records = parseOmmCsv(csvText);
	return JSON.stringify(records);
}

export function csvTo3le(csvText: string): string {
	const records = parseOmmCsv(csvText);
	const lines: string[] = [];

	for (const rec of records) {
		const tle = recordTo3le(rec);
		lines.push(tle.nameLine);
		lines.push(tle.line1);
		lines.push(tle.line2);
	}

	return lines.join("\n") + (lines.length > 0 ? "\n" : "");
}

interface ThreeLineElement {
	nameLine: string;
	line1: string;
	line2: string;
}

function recordTo3le(rec: OmmRecord): ThreeLineElement {
	const nameLine = rec.OBJECT_NAME.padEnd(24);

	const noradId = encodeAlpha5(rec.NORAD_CAT_ID);

	const classification = rec.CLASSIFICATION_TYPE || "U";

	const intDesig = convertIntDesig(rec.OBJECT_ID);

	const epochParts = isoToTleEpoch(rec.EPOCH);

	const line1 = buildLine1({
		noradId,
		classification,
		intDesig,
		epochYear: epochParts.year,
		epochDay: epochParts.day,
		meanMotionDot: rec.MEAN_MOTION_DOT,
		meanMotionDdot: rec.MEAN_MOTION_DDOT,
		bstar: rec.BSTAR,
		ephemerisType: rec.EPHEMERIS_TYPE,
		elementSetNo: rec.ELEMENT_SET_NO,
	});

	const line2 = buildLine2({
		noradId,
		inclination: rec.INCLINATION,
		raan: rec.RA_OF_ASC_NODE,
		eccentricity: rec.ECCENTRICITY,
		argOfPerigee: rec.ARG_OF_PERICENTER,
		meanAnomaly: rec.MEAN_ANOMALY,
		meanMotion: rec.MEAN_MOTION,
		revAtEpoch: rec.REV_AT_EPOCH,
	});

	return { nameLine, line1, line2 };
}

interface EpochParts {
	year: string;
	day: string;
}

export function isoToTleEpoch(iso: string): EpochParts {
	const normalized = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + "Z";
	const date = new Date(normalized);
	if (isNaN(date.getTime())) {
		throw new Error(`Invalid epoch ISO string: ${iso}`);
	}

	const year = date.getUTCFullYear();
	const twoDigitYear = String(year % 100).padStart(2, "0");

	const startOfYear = Date.UTC(year, 0, 1);
	const msInDay = 24 * 60 * 60 * 1000;
	const dayOfYear = (date.getTime() - startOfYear) / msInDay + 1;

	const dayStr = dayOfYear.toFixed(8);

	return { year: twoDigitYear, day: dayStr };
}

export function tleEpochToIso(yearStr: string, dayStr: string): string {
	const year2 = parseInt(yearStr, 10);
	const fullYear = year2 >= 57 ? 1900 + year2 : 2000 + year2;
	const dayOfYear = parseFloat(dayStr);

	const startOfYear = Date.UTC(fullYear, 0, 1);
	const msInDay = 24 * 60 * 60 * 1000;
	const epochMs = startOfYear + (dayOfYear - 1) * msInDay;

	return new Date(epochMs).toISOString();
}

interface Line1Fields {
	noradId: string;
	classification: string;
	intDesig: string;
	epochYear: string;
	epochDay: string;
	meanMotionDot: number;
	meanMotionDdot: number;
	bstar: number;
	ephemerisType: number;
	elementSetNo: number;
}

interface Line2Fields {
	noradId: string;
	inclination: number;
	raan: number;
	eccentricity: number;
	argOfPerigee: number;
	meanAnomaly: number;
	meanMotion: number;
	revAtEpoch: number;
}

function buildLine1(f: Line1Fields): string {
	const chars = new Array(68).fill(" ");

	chars[0] = "1";

	const noradPadded = f.noradId.padStart(5, " ");
	for (let i = 0; i < 5; i++) chars[2 + i] = noradPadded[i];

	chars[7] = f.classification;

	const intDesigPadded = f.intDesig.padEnd(8);
	for (let i = 0; i < 8; i++) chars[9 + i] = intDesigPadded[i];

	chars[18] = f.epochYear[0];
	chars[19] = f.epochYear[1];

	const epochDayPadded = f.epochDay.padEnd(12);
	for (let i = 0; i < 12; i++) chars[20 + i] = epochDayPadded[i];

	const firstDeriv = formatFirstDerivative(f.meanMotionDot);
	for (let i = 0; i < 10; i++) chars[33 + i] = firstDeriv[i];

	const secondDeriv = formatSecondDerivative(f.meanMotionDdot);
	for (let i = 0; i < 8; i++) chars[44 + i] = secondDeriv[i];

	const bstar = formatBstar(f.bstar);
	for (let i = 0; i < 8; i++) chars[53 + i] = bstar[i];

	chars[62] = String(f.ephemerisType);

	const elemSet = String(f.elementSetNo).padStart(4, " ");
	for (let i = 0; i < 4; i++) chars[64 + i] = elemSet[i];

	const lineWithoutChecksum = chars.join("");
	const checksum = computeChecksum(lineWithoutChecksum);
	return lineWithoutChecksum + checksum;
}

function buildLine2(f: Line2Fields): string {
	const chars = new Array(68).fill(" ");

	chars[0] = "2";

	const noradPadded = f.noradId.padStart(5, " ");
	for (let i = 0; i < 5; i++) chars[2 + i] = noradPadded[i];

	const incl = formatAngle(f.inclination);
	for (let i = 0; i < 8; i++) chars[8 + i] = incl[i];

	const raan = formatAngle(f.raan);
	for (let i = 0; i < 8; i++) chars[17 + i] = raan[i];

	const ecc = formatEccentricity(f.eccentricity);
	for (let i = 0; i < 7; i++) chars[26 + i] = ecc[i];

	const argP = formatAngle(f.argOfPerigee);
	for (let i = 0; i < 8; i++) chars[34 + i] = argP[i];

	const meanAnom = formatAngle(f.meanAnomaly);
	for (let i = 0; i < 8; i++) chars[43 + i] = meanAnom[i];

	const meanMot = formatMeanMotion(f.meanMotion);
	for (let i = 0; i < 11; i++) chars[52 + i] = meanMot[i];

	const rev = String(f.revAtEpoch).padStart(5, "0");
	for (let i = 0; i < 5; i++) chars[63 + i] = rev[i];

	const lineWithoutChecksum = chars.join("");
	const checksum = computeChecksum(lineWithoutChecksum);
	return lineWithoutChecksum + checksum;
}

export function computeChecksum(line: string): number {
	let sum = 0;
	for (const char of line) {
		const code = char.charCodeAt(0);
		if (code >= 48 && code <= 57) {
			sum += code - 48;
		} else if (char === "-") {
			sum += 1;
		}
	}
	return sum % 10;
}

function formatFirstDerivative(value: number): string {
	const sign = value > 0 ? " " : value < 0 ? "-" : " ";
	const absVal = Math.abs(value);

	const digits = absVal.toFixed(8).slice(2);
	return sign + "." + digits;
}

function formatSecondDerivative(value: number): string {
	if (value === 0) {
		return " 00000+0";
	}

	const absVal = Math.abs(value);

	const exp = Math.floor(Math.log10(absVal)) + 1;
	const mantissa = absVal / Math.pow(10, exp);
	const digits = Math.round(mantissa * 100000);

	const expStr = exp >= 0 ? `+${exp}` : `-${Math.abs(exp)}`;

	return " " + String(digits).padStart(5, "0") + expStr;
}

function formatBstar(value: number): string {
	return formatSecondDerivative(value);
}

function formatAngle(value: number): string {
	return value.toFixed(4).padStart(8, " ");
}

function formatEccentricity(value: number): string {
	return String(Math.round(value * 10000000)).padStart(7, "0");
}

function formatMeanMotion(value: number): string {
	return value.toFixed(8).padStart(11, " ");
}

export function parse3le(tleText: string): OmmRecord[] {
	const lines = tleText.trim().split(/\r?\n/);
	const records: OmmRecord[] = [];

	const is3le = lines.length >= 3 && (lines[0] ?? "").match(/^[A-Z0-9]/);

	if (is3le) {
		for (let i = 0; i + 2 < lines.length; i += 3) {
			const nameLine = (lines[i] ?? "").trim();
			const line1 = lines[i + 1];
			const line2 = lines[i + 2];
			if (line1 && line2) {
				const rec = parseTleLines(nameLine, line1, line2);
				if (rec) records.push(rec);
			}
		}
	} else {
		for (let i = 0; i + 1 < lines.length; i += 2) {
			const line1 = lines[i];
			const line2 = lines[i + 1];
			if (line1 && line2) {
				const rec = parseTleLines("", line1, line2);
				if (rec) records.push(rec);
			}
		}
	}

	return records;
}

function parseTleLines(nameLine: string, line1: string, line2: string): OmmRecord | null {
	try {
		const catalogNumStr = line1.substring(2, 7).trim();

		let noradCatId: number;
		try {
			noradCatId = parseInt(catalogNumStr, 10);
			if (isNaN(noradCatId)) {
				noradCatId = decodeAlpha5(catalogNumStr);
			}
		} catch {
			noradCatId = 0;
		}

		const classification = line1.substring(7, 8).trim() || "U";
		const intDesig = line1.substring(9, 17).trim();
		const epochYear = line1.substring(18, 20).trim();
		const epochDay = line1.substring(20, 32).trim();
		const epoch = tleEpochToIso(epochYear, epochDay);

		const meanMotionDotStr = line1.substring(33, 43).trim();
		const meanMotionDot = parseTleNumber(meanMotionDotStr);

		const meanMotionDdotStr = line1.substring(44, 52).trim();
		const meanMotionDdot = parseTleScientific(meanMotionDdotStr);

		const bstarStr = line1.substring(53, 61).trim();
		const bstar = parseTleScientific(bstarStr);

		const ephemerisType = parseInt(line1.substring(62, 63).trim(), 10) || 0;
		const elementSetNo = parseInt(line1.substring(64, 68).trim(), 10) || 0;

		const inclination = parseFloat(line2.substring(8, 16).trim());
		const raan = parseFloat(line2.substring(17, 25).trim());
		const eccStr = line2.substring(26, 33).trim();
		const eccentricity = parseFloat("0." + eccStr);
		const argOfPerigee = parseFloat(line2.substring(34, 42).trim());
		const meanAnomaly = parseFloat(line2.substring(43, 51).trim());
		const meanMotion = parseFloat(line2.substring(52, 63).trim());
		const revAtEpoch = parseInt(line2.substring(63, 68).trim(), 10) || 0;

		return {
			OBJECT_NAME: nameLine || "",
			OBJECT_ID: intDesig || "",
			EPOCH: epoch,
			MEAN_MOTION: meanMotion,
			ECCENTRICITY: eccentricity,
			INCLINATION: inclination,
			RA_OF_ASC_NODE: raan,
			ARG_OF_PERICENTER: argOfPerigee,
			MEAN_ANOMALY: meanAnomaly,
			EPHEMERIS_TYPE: ephemerisType,
			CLASSIFICATION_TYPE: classification,
			NORAD_CAT_ID: noradCatId,
			ELEMENT_SET_NO: elementSetNo,
			REV_AT_EPOCH: revAtEpoch,
			BSTAR: bstar,
			MEAN_MOTION_DOT: meanMotionDot,
			MEAN_MOTION_DDOT: meanMotionDdot,
		};
	} catch (e) {
		return null;
	}
}

function parseTleNumber(str: string): number {
	if (!str) return 0;

	const num = parseFloat(str);
	return isNaN(num) ? 0 : num;
}

function parseTleScientific(str: string): number {
	if (!str || str === "00000-0") return 0;

	const match = str.match(/^(\d{5})([+-])(\d{2})$/);
	if (!match) {
		const num = parseFloat(str);
		return isNaN(num) ? 0 : num;
	}

	const mantissa = parseInt(match[1] ?? "0", 10) / 100000;
	const sign = match[2] === "-" ? -1 : 1;
	const exp = parseInt(match[3] ?? "0", 10);

	return sign * mantissa * Math.pow(10, exp);
}

export function csvToTle(csvText: string): string {
	return csvTo3le(csvText);
}

export function jsonTo3le(jsonText: string): string {
	const records = JSON.parse(jsonText) as OmmRecord[];
	const lines: string[] = [];

	for (const rec of records) {
		const tle = recordTo3le(rec);
		lines.push(tle.nameLine);
		lines.push(tle.line1);
		lines.push(tle.line2);
	}

	return lines.join("\n") + (lines.length > 0 ? "\n" : "");
}

export function recordsToCsv(records: OmmRecord[]): string {
	const header = OMM_CSV_COLUMNS.join(",");
	const rows = records.map((rec) => {
		return OMM_CSV_COLUMNS.map((col) => {
			const val = (rec as any)[col];
			if (typeof val === "string" && val.includes(",")) {
				return `"${val}"`;
			}
			return String(val ?? "");
		}).join(",");
	});
	return [header, ...rows].join("\n") + (records.length > 0 ? "\n" : "");
}

export function filterRecordsToCsv(records: OmmRecord[], predicate: (rec: OmmRecord) => boolean): string {
	const filtered = records.filter(predicate);
	return recordsToCsv(filtered);
}

export function jsonToCsv(jsonText: string): string {
	const records = JSON.parse(jsonText) as OmmRecord[];
	return recordsToCsv(records);
}

export default {
	parseOmmCsv,
	csvToJson,
	csvTo3le,
	csvToTle,
	jsonTo3le,
	jsonToCsv,
	recordsToCsv,
	filterRecordsToCsv,
	parse3le,
	computeChecksum,
	isoToTleEpoch,
	tleEpochToIso,
};
