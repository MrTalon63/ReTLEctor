import { describe, expect, test, beforeAll } from "bun:test";
import orbitRoute from "../src/routes/orbit";
import kv from "../src/utils/kv";
import { parseOmmCsv, csvToJson, csvTo3le, csvToKvn } from "../src/utils/omm";

const SAMPLE_CSV = `OBJECT_NAME,OBJECT_ID,EPOCH,MEAN_MOTION,ECCENTRICITY,INCLINATION,RA_OF_ASC_NODE,ARG_OF_PERICENTER,MEAN_ANOMALY,EPHEMERIS_TYPE,CLASSIFICATION_TYPE,NORAD_CAT_ID,ELEMENT_SET_NO,REV_AT_EPOCH,BSTAR,MEAN_MOTION_DOT,MEAN_MOTION_DDOT
"ISS (ZARYA)","1998-067A","2026-08-15T12:00:00.000000",15.49812345,0.0001234,51.6432,123.4567,234.5678,345.6789,0,"U",25544,999,50000,0.00012345,0.00001234,0
"TIANGONG","2021-035A","2026-08-15T12:00:00.000000",15.61234567,0.0002345,41.4721,210.1234,180.5432,190.1234,0,"U",48274,888,25000,0.00023456,0.00002345,0`;

describe("Unified orbit router (/:group/:format & /:noradId/:format)", () => {
	beforeAll(async () => {
		const now = Date.now();
		await kv.set("active_csv", SAMPLE_CSV);
		await kv.set("active_json", csvToJson(SAMPLE_CSV));
		await kv.set("active_tle", csvTo3le(SAMPLE_CSV));
		await kv.set("active_kvn", csvToKvn(SAMPLE_CSV));
		await kv.set("active_timestamp_csv", now);
		await kv.set("active_timestamp_json", now);
		await kv.set("active_timestamp_tle", now);
		await kv.set("active_timestamp_kvn", now);
	}, 15000);

	describe("Group Routes", () => {
		test("GET /active defaults to CSV format", async () => {
			const res = await orbitRoute.handle(new Request("http://localhost/active"));
			expect(res.status).toBe(200);
			expect(res.headers.get("Content-Type")).toBe("text/plain");
			const text = await res.text();
			expect(text).toContain("OBJECT_NAME,OBJECT_ID");
			expect(text).toContain("ISS (ZARYA)");
		});

		test("GET /active/csv returns CSV format", async () => {
			const res = await orbitRoute.handle(new Request("http://localhost/active/csv"));
			expect(res.status).toBe(200);
			expect(res.headers.get("Content-Type")).toBe("text/plain");
			const text = await res.text();
			expect(text).toContain("ISS (ZARYA)");
		});

		test("GET /active/json returns JSON format", async () => {
			const res = await orbitRoute.handle(new Request("http://localhost/active/json"));
			expect(res.status).toBe(200);
			expect(res.headers.get("Content-Type")).toBe("application/json");
			const json = (await res.json()) as any[];
			expect(Array.isArray(json)).toBe(true);
			expect(json.length).toBeGreaterThan(0);
		});

		test("GET /active/tle returns 3LE format", async () => {
			const res = await orbitRoute.handle(new Request("http://localhost/active/tle"));
			expect(res.status).toBe(200);
			expect(res.headers.get("Content-Type")).toBe("text/plain");
			const text = await res.text();
			expect(text).toContain("ISS (ZARYA)");
			expect(text).toContain("1 25544U");
		});

		test("GET /active/3le (alias) returns 3LE format", async () => {
			const res = await orbitRoute.handle(new Request("http://localhost/active/3le"));
			expect(res.status).toBe(200);
			expect(res.headers.get("Content-Type")).toBe("text/plain");
			const text = await res.text();
			expect(text).toContain("ISS (ZARYA)");
		});

		test("GET /active/kvn returns KVN format", async () => {
			const res = await orbitRoute.handle(new Request("http://localhost/active/kvn"));
			expect(res.status).toBe(200);
			expect(res.headers.get("Content-Type")).toBe("text/plain");
			const text = await res.text();
			expect(text).toContain("CCSDS_OMM_VERS = 2.0");
			expect(text).toContain("OBJECT_NAME    = ISS (ZARYA)");
		});

		test("GET /active/status returns status string", async () => {
			const res = await orbitRoute.handle(new Request("http://localhost/active/status"));
			expect(res.status).toBe(200);
			const text = await res.text();
			expect(text).toContain("Group: active");
			expect(text).toContain("Status:");
		});

		test("GET /active/invalidformat returns 400 with helpful error", async () => {
			const res = await orbitRoute.handle(new Request("http://localhost/active/xml"));
			expect(res.status).toBe(400);
			const text = await res.text();
			expect(text).toContain('Invalid format "xml"');
		});

		test("GET /active with If-Modified-Since after cache timestamp returns 304", async () => {
			const futureDate = new Date(Date.now() + 60000).toUTCString();
			const res = await orbitRoute.handle(
				new Request("http://localhost/active", {
					headers: { "If-Modified-Since": futureDate },
				}),
			);
			expect(res.status).toBe(304);
		});

		test("GET /active with If-Modified-Since before cache timestamp returns 200", async () => {
			const pastDate = new Date(Date.now() - 600000).toUTCString();
			const res = await orbitRoute.handle(
				new Request("http://localhost/active", {
					headers: { "If-Modified-Since": pastDate },
				}),
			);
			expect(res.status).toBe(200);
		});

		test("GET /nonexistent_group returns 404", async () => {
			const res = await orbitRoute.handle(new Request("http://localhost/nonexistent_group"));
			expect(res.status).toBe(404);
		});
	});

	describe("NORAD ID Routes", () => {
		test("GET /25544 defaults to CSV format", async () => {
			const res = await orbitRoute.handle(new Request("http://localhost/25544"));
			expect(res.status).toBe(200);
			expect(res.headers.get("Content-Type")).toBe("text/plain");
			const text = await res.text();
			const parsed = parseOmmCsv(text);
			expect(parsed.length).toBe(1);
			expect(parsed[0]!.NORAD_CAT_ID).toBe(25544);
		});

		test("GET /25544/csv returns CSV format", async () => {
			const res = await orbitRoute.handle(new Request("http://localhost/25544/csv"));
			expect(res.status).toBe(200);
			const text = await res.text();
			const parsed = parseOmmCsv(text);
			expect(parsed.length).toBe(1);
			expect(parsed[0]!.NORAD_CAT_ID).toBe(25544);
		});

		test("GET /25544/json returns JSON format", async () => {
			const res = await orbitRoute.handle(new Request("http://localhost/25544/json"));
			expect(res.status).toBe(200);
			expect(res.headers.get("Content-Type")).toBe("application/json");
			const json = (await res.json()) as any[];
			expect(Array.isArray(json)).toBe(true);
			expect(json[0]!.NORAD_CAT_ID).toBe(25544);
		});

		test("GET /25544/tle returns 3LE format", async () => {
			const res = await orbitRoute.handle(new Request("http://localhost/25544/tle"));
			expect(res.status).toBe(200);
			expect(res.headers.get("Content-Type")).toBe("text/plain");
			const text = await res.text();
			expect(text).toContain("ISS (ZARYA)");
			expect(text).toContain("1 25544U");
		});

		test("GET /25544/3le returns 3LE format", async () => {
			const res = await orbitRoute.handle(new Request("http://localhost/25544/3le"));
			expect(res.status).toBe(200);
			const text = await res.text();
			expect(text).toContain("ISS (ZARYA)");
		});

		test("GET /25544/kvn returns KVN format", async () => {
			const res = await orbitRoute.handle(new Request("http://localhost/25544/kvn"));
			expect(res.status).toBe(200);
			expect(res.headers.get("Content-Type")).toBe("text/plain");
			const text = await res.text();
			expect(text).toContain("CCSDS_OMM_VERS = 2.0");
			expect(text).toContain("OBJECT_NAME    = ISS (ZARYA)");
			expect(text).toContain("NORAD_CAT_ID   = 25544");
		});

		test("GET /25544/status returns 400 since status is only for groups", async () => {
			const res = await orbitRoute.handle(new Request("http://localhost/25544/status"));
			expect(res.status).toBe(400);
			const text = await res.text();
			expect(text).toContain("Status check is only available for groups.");
		});

		test("GET /25544/badformat returns 400", async () => {
			const res = await orbitRoute.handle(new Request("http://localhost/25544/badformat"));
			expect(res.status).toBe(400);
			const text = await res.text();
			expect(text).toContain('Invalid format "badformat"');
		});
	});
});
