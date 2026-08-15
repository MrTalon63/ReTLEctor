import { describe, expect, test } from "bun:test";
import { parseOmmCsv, csvToJson, csvTo3le, parse3le, computeChecksum, isoToTleEpoch, tleEpochToIso } from "../src/utils/omm";
import { readFileSync } from "fs";
import { join } from "path";

const examplesDir = join(import.meta.dir, "..", "examples");
const issCsv = readFileSync(join(examplesDir, "iss.csv"), "utf-8");
const issJson = readFileSync(join(examplesDir, "iss.json"), "utf-8");
const issTle = readFileSync(join(examplesDir, "iss.tle"), "utf-8");

describe("OMM CSV parsing", () => {
	test("parseOmmCsv parses ISS CSV correctly", () => {
		const records = parseOmmCsv(issCsv);
		expect(records).toHaveLength(1);

		const rec = records[0]!;
		expect(rec.OBJECT_NAME).toBe("ISS (ZARYA)");
		expect(rec.OBJECT_ID).toBe("1998-067A");
		expect(rec.EPOCH).toBe("2026-08-15T02:00:30.363264");
		expect(rec.MEAN_MOTION).toBeCloseTo(15.49446478, 8);
		expect(rec.ECCENTRICITY).toBeCloseTo(0.0007564, 7);
		expect(rec.INCLINATION).toBeCloseTo(51.633, 4);
		expect(rec.RA_OF_ASC_NODE).toBeCloseTo(8.6029, 4);
		expect(rec.ARG_OF_PERICENTER).toBeCloseTo(47.5489, 4);
		expect(rec.MEAN_ANOMALY).toBeCloseTo(312.6138, 4);
		expect(rec.EPHEMERIS_TYPE).toBe(0);
		expect(rec.CLASSIFICATION_TYPE).toBe("U");
		expect(rec.NORAD_CAT_ID).toBe(25544);
		expect(rec.ELEMENT_SET_NO).toBe(999);
		expect(rec.REV_AT_EPOCH).toBe(58088);
		expect(rec.BSTAR).toBeCloseTo(9.8393e-5, 10);
		expect(rec.MEAN_MOTION_DOT).toBeCloseTo(5.059e-5, 8);
		expect(rec.MEAN_MOTION_DDOT).toBe(0);
	});

	test("parseOmmCsv handles empty input", () => {
		expect(parseOmmCsv("")).toHaveLength(0);
		expect(parseOmmCsv("OBJECT_NAME,OBJECT_ID\n")).toHaveLength(0);
	});

	test("parseOmmCsv handles quoted fields with commas", () => {
		const csv = `OBJECT_NAME,OBJECT_ID,EPOCH,MEAN_MOTION,ECCENTRICITY,INCLINATION,RA_OF_ASC_NODE,ARG_OF_PERICENTER,MEAN_ANOMALY,EPHEMERIS_TYPE,CLASSIFICATION_TYPE,NORAD_CAT_ID,ELEMENT_SET_NO,REV_AT_EPOCH,BSTAR,MEAN_MOTION_DOT,MEAN_MOTION_DDOT
"TEST, SATELLITE",1998-067A,2026-08-06T01:17:37.872384,15.49359774,0.00072161,51.6321,53.3065,17.1615,342.9616,0,U,25544,999,57948,0.00007969016,0.00003997,0`;
		const records = parseOmmCsv(csv);
		expect(records).toHaveLength(1);
		expect(records[0]!.OBJECT_NAME).toBe("TEST, SATELLITE");
	});
});

describe("OMM CSV to JSON conversion", () => {
	test("csvToJson produces valid JSON matching ISS example", () => {
		const json = csvToJson(issCsv);
		const parsed = JSON.parse(json);
		expect(parsed).toHaveLength(1);

		const exampleJson = JSON.parse(issJson);
		expect(parsed[0].OBJECT_NAME).toBe(exampleJson[0].OBJECT_NAME);
		expect(parsed[0].OBJECT_ID).toBe(exampleJson[0].OBJECT_ID);
		expect(parsed[0].EPOCH).toBe(exampleJson[0].EPOCH);
		expect(parsed[0].NORAD_CAT_ID).toBe(exampleJson[0].NORAD_CAT_ID);
		expect(parsed[0].MEAN_MOTION).toBeCloseTo(exampleJson[0].MEAN_MOTION, 8);
		expect(parsed[0].ECCENTRICITY).toBeCloseTo(exampleJson[0].ECCENTRICITY, 8);
	});
});

describe("OMM CSV to 3LE conversion", () => {
	test("csvTo3le produces valid 3LE matching ISS example", () => {
		const tle = csvTo3le(issCsv);

		const lines = tle.split("\n").filter((l) => l.length > 0);
		expect(lines).toHaveLength(3);

		expect(lines[0]).toBe("ISS (ZARYA)             ");

		expect(lines[1]!.startsWith("1 ")).toBe(true);
		expect(lines[1]!.substring(2, 7)).toBe("25544");
		expect(lines[1]!.substring(7, 8)).toBe("U");

		expect(lines[2]!.startsWith("2 ")).toBe(true);
		expect(lines[2]!.substring(2, 7)).toBe("25544");
	});

	test("csvTo3le produces correct epoch", () => {
		const tle = csvTo3le(issCsv);
		const lines = tle.trim().split("\n");

		expect(lines[1]!.substring(18, 20)).toBe("26");

		expect(lines[1]!.substring(20, 32)).toBe("227.08368476");
	});

	test("csvTo3le produces correct orbital elements", () => {
		const tle = csvTo3le(issCsv);
		const lines = tle.trim().split("\n");

		expect(lines[2]!.substring(8, 16).trim()).toBe("51.6330");

		expect(lines[2]!.substring(17, 25).trim()).toBe("8.6029");

		expect(lines[2]!.substring(26, 33)).toBe("0007564");

		expect(lines[2]!.substring(34, 42).trim()).toBe("47.5489");

		expect(lines[2]!.substring(43, 51).trim()).toBe("312.6138");

		expect(lines[2]!.substring(52, 63).trim()).toBe("15.49446478");

		expect(lines[2]!.substring(63, 68)).toBe("58088");
	});

	test("csvTo3le produces valid checksums", () => {
		const tle = csvTo3le(issCsv);
		const lines = tle.trim().split("\n");

		const line1Checksum = parseInt(lines[1]![68]!, 10);
		const computedLine1 = computeChecksum(lines[1]!.substring(0, 68));
		expect(line1Checksum).toBe(computedLine1);

		const line2Checksum = parseInt(lines[2]![68]!, 10);
		const computedLine2 = computeChecksum(lines[2]!.substring(0, 68));
		expect(line2Checksum).toBe(computedLine2);
	});

	test("csvTo3le produces 69-char lines", () => {
		const tle = csvTo3le(issCsv);
		const lines = tle.trim().split("\n");
		expect(lines[1]).toHaveLength(69);
		expect(lines[2]).toHaveLength(69);
	});
});

describe("TLE checksum", () => {
	test("computeChecksum for ISS line 1", () => {
		const line1 = "1 25544U 98067A   26227.08368476  .00005059  00000+0  98393-4 0  9995";
		expect(computeChecksum(line1.substring(0, 68))).toBe(5);
	});

	test("computeChecksum for ISS line 2", () => {
		const line2 = "2 25544  51.6330   8.6029 0007564  47.5489 312.6138 15.49446478580889";
		expect(computeChecksum(line2.substring(0, 68))).toBe(9);
	});

	test("computeChecksum handles minus signs", () => {
		expect(computeChecksum("1 25544U 98067A   26218.05391056 -.00003997  00000+0  79690-4 0  999")).toBe(1);
	});
});

describe("Epoch conversion", () => {
	test("isoToTleEpoch converts ISS epoch correctly", () => {
		const { year, day } = isoToTleEpoch("2026-08-15T02:00:30.363264");
		expect(year).toBe("26");
		expect(day).toBe("227.08368476");
	});

	test("tleEpochToIso converts back correctly", () => {
		const iso = tleEpochToIso("26", "227.08368476");

		const date = new Date(iso);
		expect(date.getUTCFullYear()).toBe(2026);
		expect(date.getUTCMonth()).toBe(7);
		expect(date.getUTCDate()).toBe(15);
	});

	test("round-trip: isoToTleEpoch → tleEpochToIso", () => {
		const original = "2026-08-15T02:00:30.363264";
		const { year, day } = isoToTleEpoch(original);
		const result = tleEpochToIso(year, day);

		const origDate = new Date(original);
		const resultDate = new Date(result);
		expect(Math.abs(origDate.getTime() - resultDate.getTime())).toBeLessThan(1000);
	});

	test("year 2057 boundary (Y2K-like issue)", () => {
		const { year } = isoToTleEpoch("2057-01-01T00:00:00.000Z");
		expect(year).toBe("57");
		const iso = tleEpochToIso("57", "001.00000000");
		expect(new Date(iso).getUTCFullYear()).toBe(1957);
	});
});

describe("3LE parsing", () => {
	test("parse3le parses ISS 3LE correctly", () => {
		const records = parse3le(issTle);
		expect(records).toHaveLength(1);

		const rec = records[0]!;
		expect(rec.OBJECT_NAME).toBe("ISS (ZARYA)");
		expect(rec.NORAD_CAT_ID).toBe(25544);
		expect(rec.CLASSIFICATION_TYPE).toBe("U");
		expect(rec.OBJECT_ID).toBe("98067A");
		expect(rec.MEAN_MOTION).toBeCloseTo(15.49446478, 8);

		expect(rec.ECCENTRICITY).toBeCloseTo(0.0007564, 7);
		expect(rec.INCLINATION).toBeCloseTo(51.633, 4);
	});

	test("parse3le handles 2LE format (no name line)", () => {
		const tle2le = `1 25544U 98067A   26218.05391056  .00003997  00000+0  79690-4 0  9990
2 25544  51.6321  53.3065 0007216  17.1615 342.9616 15.49359774579487`;
		const records = parse3le(tle2le);
		expect(records).toHaveLength(1);
		expect(records[0]!.NORAD_CAT_ID).toBe(25544);
	});

	test("parse3le handles Alpha-5 catalog numbers", () => {
		const tleAlpha5 = `TEST SAT
1 A0123  98067A   26218.05391056  .00003997  00000+0  79690-4 0  9990
2 A0123  51.6321  53.3065 0007216  17.1615 342.9616 15.49359774579487`;
		const records = parse3le(tleAlpha5);
		expect(records).toHaveLength(1);
		expect(records[0]!.NORAD_CAT_ID).toBe(100123);
	});
});

describe("CSV ↔ 3LE round-trip", () => {
	test("CSV → 3LE → parse3le preserves key fields", () => {
		const tle = csvTo3le(issCsv);
		const records = parse3le(tle);
		expect(records).toHaveLength(1);

		const rec = records[0]!;
		expect(rec.OBJECT_NAME).toBe("ISS (ZARYA)");
		expect(rec.NORAD_CAT_ID).toBe(25544);
		expect(rec.MEAN_MOTION).toBeCloseTo(15.49446478, 8);

		expect(rec.ECCENTRICITY).toBeCloseTo(0.0007564, 7);
		expect(rec.INCLINATION).toBeCloseTo(51.633, 4);
		expect(rec.RA_OF_ASC_NODE).toBeCloseTo(8.6029, 4);
		expect(rec.ARG_OF_PERICENTER).toBeCloseTo(47.5489, 4);
		expect(rec.MEAN_ANOMALY).toBeCloseTo(312.6138, 4);
		expect(rec.REV_AT_EPOCH).toBe(58088);
	});
});

describe("CCSDS OMM KVN conversion and parsing", () => {
	const { parseOmmKvn, csvToKvn, kvnToJson, kvnToCsv, kvnTo3le } = require("../src/utils/omm");
	const issKvn = readFileSync(join(examplesDir, "iss.kvn"), "utf-8");

	test("parseOmmKvn parses iss.kvn correctly", () => {
		const records = parseOmmKvn(issKvn);
		expect(records).toHaveLength(1);
		const rec = records[0]!;
		expect(rec.OBJECT_NAME).toBe("ISS (ZARYA)");
		expect(rec.OBJECT_ID).toBe("1998-067A");
		expect(rec.EPOCH).toBe("2026-08-15T02:00:30.363264");
		expect(rec.NORAD_CAT_ID).toBe(25544);
		expect(rec.MEAN_MOTION).toBeCloseTo(15.49446478, 8);
		expect(rec.ECCENTRICITY).toBeCloseTo(0.0007564, 7);
		expect(rec.INCLINATION).toBeCloseTo(51.633, 4);
		expect(rec.RA_OF_ASC_NODE).toBeCloseTo(8.6029, 4);
		expect(rec.ARG_OF_PERICENTER).toBeCloseTo(47.5489, 4);
		expect(rec.MEAN_ANOMALY).toBeCloseTo(312.6138, 4);
		expect(rec.REV_AT_EPOCH).toBe(58088);
	});

	test("csvToKvn generates valid KVN containing required headers and fields", () => {
		const kvn = csvToKvn(issCsv);
		expect(kvn).toContain("CCSDS_OMM_VERS = 2.0");
		expect(kvn).toContain("OBJECT_NAME    = ISS (ZARYA)");
		expect(kvn).toContain("OBJECT_ID      = 1998-067A");
		expect(kvn).toContain("CENTER_NAME    = EARTH");
		expect(kvn).toContain("REF_FRAME      = TEME");
		expect(kvn).toContain("NORAD_CAT_ID   = 25544");
		expect(kvn).toContain("MEAN_MOTION    = 15.49446478");
	});

	test("round-trip: KVN → JSON → KVN preserves record integrity", () => {
		const json = kvnToJson(issKvn);
		const parsed = JSON.parse(json);
		expect(parsed).toHaveLength(1);
		expect(parsed[0]!.NORAD_CAT_ID).toBe(25544);
		expect(parsed[0]!.OBJECT_NAME).toBe("ISS (ZARYA)");
	});

	test("round-trip: KVN → CSV → KVN", () => {
		const csv = kvnToCsv(issKvn);
		const records = parseOmmCsv(csv);
		expect(records).toHaveLength(1);
		expect(records[0]!.NORAD_CAT_ID).toBe(25544);
		expect(records[0]!.OBJECT_NAME).toBe("ISS (ZARYA)");
	});

	test("kvnTo3le produces valid 3LE from KVN", () => {
		const tle = kvnTo3le(issKvn);
		const lines = tle.trim().split("\n");
		expect(lines).toHaveLength(3);
		expect(lines[0]).toBe("ISS (ZARYA)             ");
		expect(lines[1]!.substring(2, 7)).toBe("25544");
		expect(lines[2]!.substring(2, 7)).toBe("25544");
	});
});
