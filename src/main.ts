import { Elysia } from "elysia";
import { html } from "@elysiajs/html";
import { wrap } from "@bogeychan/elysia-logger";

import tleRoute from "./routes/tle";
import jsonRoute from "./routes/json";
import csvRoute from "./routes/csv";
import noradRoute from "./routes/norad";

import index from "./pub/index.tsx";
import kv from "./utils/kv";
import config from "./utils/config";
import log from "./utils/logger";
import { version } from "../package.json";

new Elysia()
	.use(wrap(log))
	// Use HTML plugin for rendering the index page
	.use(html())
	.get("/styles.css", () => new Response(Bun.file(new URL("./pub/styles.css", import.meta.url)), { headers: { "Content-Type": "text/css", "Cache-Control": "public, max-age=86400" } }))
	.get("/favicon.ico", () => new Response(Bun.file(new URL("./pub/favicon.ico", import.meta.url)), { headers: { "Content-Type": "image/x-icon", "Cache-Control": "public, max-age=86400" } }))
	.get("/retlector.png", () => new Response(Bun.file(new URL("./pub/retlector.png", import.meta.url)), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" } }))
	.get("/", async () => {
		const activeGroups = [];
		for (const group of config.allowedGroups) {
			const tleTimestamp = await kv.get(`${group}_timestamp_tle`);
			const jsonTimestamp = await kv.get(`${group}_timestamp_json`);
			const csvTimestamp = await kv.get(`${group}_timestamp_csv`);
			const lastUpdateTle = tleTimestamp ? new Date(tleTimestamp).toISOString() : "Never";
			const lastUpdateJson = jsonTimestamp ? new Date(jsonTimestamp).toISOString() : "Never";
			const lastUpdateCsv = csvTimestamp ? new Date(csvTimestamp).toISOString() : "Never";
			activeGroups.push({ name: group, lastUpdateTle, lastUpdateJson, lastUpdateCsv });
		}
		return index({ activeGroups, cacheDuration: config.cacheDuration, maxReq: config.rateLimitMaxRequests, maxReqWindow: config.rateLimitWindow, version });
	})

	// Subroutes registers
	.use(tleRoute) // Import TLE routes
	.use(jsonRoute) // Import JSON routes
	.use(csvRoute) // Import CSV routes
	.use(noradRoute) // Import NORAD routes

	.listen(config.port, () => {
		log.info(`Server is running on port ${config.port}`);
	});
