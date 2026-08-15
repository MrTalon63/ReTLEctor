import { describe, expect, test, beforeEach } from "bun:test";
import apiRoute, { FORMATS, getActiveGroupsData } from "../src/routes/api";
import app from "../src/app";
import kv from "../src/utils/kv";
import config from "../src/utils/config";

describe("API v1 routes", () => {
	beforeEach(async () => {
		await kv.set("active_timestamp_csv", Date.now());
	});

	test("FORMATS constant lists tle, json, csv, and kvn with required fields", () => {
		expect(FORMATS.length).toBe(4);
		const ids = FORMATS.map((f) => f.id);
		expect(ids).toContain("tle");
		expect(ids).toContain("json");
		expect(ids).toContain("csv");
		expect(ids).toContain("kvn");

		for (const format of FORMATS) {
			expect(format.id).toBeDefined();
			expect(format.name).toBeDefined();
			expect(format.contentType).toBeDefined();
			expect(format.groupEndpoint).toBeDefined();
			expect(format.idEndpoint).toBeDefined();
		}
	});

	test("getActiveGroupsData returns array of group status objects", async () => {
		const groups = await getActiveGroupsData();
		expect(Array.isArray(groups)).toBe(true);
		expect(groups.length).toBe(config.allowedGroups.length);

		const activeGroup = groups.find((g) => g.name === "active");
		expect(activeGroup).toBeDefined();
		expect(activeGroup?.derived).toBe(false);
		expect(activeGroup?.status).toBe("fresh");
		expect(activeGroup?.endpoints.default).toBe("/active");
		expect(activeGroup?.endpoints.csv).toBe("/active/csv");
		expect(activeGroup?.endpoints.json).toBe("/active/json");
		expect(activeGroup?.endpoints.tle).toBe("/active/tle");
		expect(activeGroup?.endpoints.kvn).toBe("/active/kvn");
		expect(activeGroup?.endpoints.status).toBe("/active/status");

		const derivedGroup = groups.find((g) => g.name === "active-no-starlink");
		expect(derivedGroup).toBeDefined();
		expect(derivedGroup?.derived).toBe(true);
		expect(derivedGroup?.source).toBe("active");
	});

	test("GET /api root returns API versions and latest version info", async () => {
		const response = await apiRoute.handle(new Request("http://localhost/api"));
		expect(response.status).toBe(200);
		const json = (await response.json()) as any;
		expect(json.versions).toContain("v1");
		expect(json.latest).toBe("/api/v1");
	});

	test("GET /api/v1 root returns version and available endpoints", async () => {
		const response = await apiRoute.handle(new Request("http://localhost/api/v1"));
		expect(response.status).toBe(200);
		const json = (await response.json()) as any;
		expect(json.apiVersion).toBe("v1");
		expect(json.endpoints.groups).toBe("/api/v1/groups");
		expect(json.endpoints.formats).toBe("/api/v1/formats");
	});

	test("GET /api/v1/formats returns format list", async () => {
		const response = await apiRoute.handle(new Request("http://localhost/api/v1/formats"));
		expect(response.status).toBe(200);
		const json = (await response.json()) as any;
		expect(Array.isArray(json)).toBe(true);
		expect(json.length).toBe(4);
		expect(json[0].id).toBe("csv");
	});

	test("GET /api/v1/groups returns active groups in JSON format", async () => {
		const response = await apiRoute.handle(new Request("http://localhost/api/v1/groups"));
		expect(response.status).toBe(200);
		const json = (await response.json()) as any;
		expect(typeof json.count).toBe("number");
		expect(Array.isArray(json.groups)).toBe(true);
		expect(json.groups.length).toBe(config.allowedGroups.length);
	});

	test("GET /openapi/json returns OpenAPI specification document containing all routes", async () => {
		const response = await app.handle(new Request("http://localhost/openapi/json"));
		expect(response.status).toBe(200);
		const spec = (await response.json()) as any;
		expect(spec.openapi).toBeDefined();
		expect(spec.info).toBeDefined();
		expect(spec.info.title).toContain(config.appName);
		expect(spec.paths).toBeDefined();
		expect(spec.paths["/api/v1/groups"]).toBeDefined();
		expect(spec.paths["/api/v1/formats"]).toBeDefined();
		expect(spec.paths["/{target}"]).toBeDefined();
		expect(spec.paths["/{target}/{format}"]).toBeDefined();
		expect(spec.paths["/{target}/status"]).toBeDefined();
	});

	test("GET /openapi returns Scalar OpenAPI HTML UI", async () => {
		const response = await app.handle(new Request("http://localhost/openapi"));
		expect(response.status).toBe(200);
		const html = await response.text();
		expect(html.length).toBeGreaterThan(0);
		expect(html).toContain("api-reference");
		expect(html).toContain(config.appName);
	});

	test("GET /openapi/ with trailing slash returns Scalar OpenAPI HTML UI", async () => {
		const response = await app.handle(new Request("http://localhost/openapi/"));
		expect(response.status).toBe(200);
		const html = await response.text();
		expect(html.length).toBeGreaterThan(0);
		expect(html).toContain("api-reference");
	});

	test("GET /api/openapi redirects to /openapi", async () => {
		const response = await app.handle(new Request("http://localhost/api/openapi"));
		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toBe("/openapi");
	});

	test("GET /api/openapi/json redirects to /openapi/json", async () => {
		const response = await app.handle(new Request("http://localhost/api/openapi/json"));
		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toBe("/openapi/json");
	});
});
