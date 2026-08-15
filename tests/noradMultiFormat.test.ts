import { describe, expect, test, beforeAll } from "bun:test";
import kv from "../src/utils/kv";
import { getNoradData, handleNoradRequest } from "../src/utils/tleGetter";
import { parseOmmCsv } from "../src/utils/omm";

const SAMPLE_CSV = `OBJECT_NAME,OBJECT_ID,EPOCH,MEAN_MOTION,ECCENTRICITY,INCLINATION,RA_OF_ASC_NODE,ARG_OF_PERICENTER,MEAN_ANOMALY,EPHEMERIS_TYPE,CLASSIFICATION_TYPE,NORAD_CAT_ID,ELEMENT_SET_NO,REV_AT_EPOCH,BSTAR,MEAN_MOTION_DOT,MEAN_MOTION_DDOT
"ISS (ZARYA)","1998-067A","2026-08-15T12:00:00.000000",15.49812345,0.0001234,51.6432,123.4567,234.5678,345.6789,0,"U",25544,999,50000,0.00012345,0.00001234,0
"TIANGONG","2021-035A","2026-08-15T12:00:00.000000",15.61234567,0.0002345,41.4721,210.1234,180.5432,190.1234,0,"U",48274,888,25000,0.00023456,0.00002345,0`;

describe("Multi-format NORAD ID lookups", () => {
	beforeAll(async () => {
		await kv.set("active_csv", SAMPLE_CSV);
		await kv.set("active_timestamp_csv", Date.now());
	});

	test("getNoradData returns TLE format (3LE)", async () => {
		const result = await getNoradData(25544, "tle");
		expect(result.contentType).toBe("text/plain");
		expect(result.data).toContain("ISS (ZARYA)");
		expect(result.data).toContain("1 25544U");
		expect(result.data).toContain("2 25544 ");
	});

	test("getNoradData returns JSON format (OMM JSON)", async () => {
		const result = await getNoradData(25544, "json");
		expect(result.contentType).toBe("application/json");
		const parsed = JSON.parse(result.data);
		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed.length).toBe(1);
		expect(parsed[0]!.OBJECT_NAME).toBe("ISS (ZARYA)");
		expect(parsed[0]!.NORAD_CAT_ID).toBe(25544);
	});

	test("getNoradData returns CSV format (OMM CSV)", async () => {
		const result = await getNoradData(25544, "csv");
		expect(result.contentType).toBe("text/plain");
		const parsed = parseOmmCsv(result.data);
		expect(parsed.length).toBe(1);
		expect(parsed[0]!.OBJECT_NAME).toBe("ISS (ZARYA)");
		expect(parsed[0]!.NORAD_CAT_ID).toBe(25544);
	});

	test("getNoradData returns KVN format (OMM KVN)", async () => {
		const result = await getNoradData(25544, "kvn");
		expect(result.contentType).toBe("text/plain");
		expect(result.data).toContain("CCSDS_OMM_VERS = 2.0");
		expect(result.data).toContain("OBJECT_NAME    = ISS (ZARYA)");
		expect(result.data).toContain("NORAD_CAT_ID   = 25544");
	});

	test("handleNoradRequest handles invalid NORAD IDs with 400", async () => {
		const resp = await handleNoradRequest("abc", "tle");
		expect(resp.status).toBe(400);
		const text = await resp.text();
		expect(text).toBe("Invalid NORAD ID.");
	});

	test("handleNoradRequest returns correct headers for valid ID", async () => {
		const respJson = await handleNoradRequest("25544", "json");
		expect(respJson.status).toBe(200);
		expect(respJson.headers.get("Content-Type")).toBe("application/json");
		expect(respJson.headers.get("Cache-Control")).toContain("max-age=");

		const respTle = await handleNoradRequest("48274", "tle");
		expect(respTle.status).toBe(200);
		expect(respTle.headers.get("Content-Type")).toBe("text/plain");
		const text = await respTle.text();
		expect(text).toContain("TIANGONG");
	});

	test("handleNoradRequest supports Alpha-5 NORAD IDs", async () => {
		const respAlpha = await handleNoradRequest("A0123", "tle");
		// A0123 is decoded to 100123 (which won't be in active group mock, so it returns 404/503 not 400 invalid ID)
		expect(respAlpha.status).not.toBe(400);
	});

	test("normalizeOrbitFormat defaults to csv and aliases 3le to tle", () => {
		const { normalizeOrbitFormat, isValidOrbitFormat } = require("../src/utils/tleGetter");
		expect(normalizeOrbitFormat()).toBe("csv");
		expect(normalizeOrbitFormat("")).toBe("csv");
		expect(normalizeOrbitFormat("csv")).toBe("csv");
		expect(normalizeOrbitFormat("json")).toBe("json");
		expect(normalizeOrbitFormat("tle")).toBe("tle");
		expect(normalizeOrbitFormat("3le")).toBe("tle");
		expect(normalizeOrbitFormat("3LE")).toBe("tle");
		expect(normalizeOrbitFormat("TLE")).toBe("tle");
		expect(normalizeOrbitFormat("kvn")).toBe("kvn");
		expect(normalizeOrbitFormat("KVN")).toBe("kvn");

		expect(isValidOrbitFormat("csv")).toBe(true);
		expect(isValidOrbitFormat("json")).toBe(true);
		expect(isValidOrbitFormat("tle")).toBe(true);
		expect(isValidOrbitFormat("3le")).toBe(true);
		expect(isValidOrbitFormat("kvn")).toBe(true);
		expect(isValidOrbitFormat("unknown")).toBe(false);
	});
});
