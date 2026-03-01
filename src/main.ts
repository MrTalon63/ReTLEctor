import { Elysia } from "elysia";
import { html } from "@elysiajs/html";
import { wrap } from "@bogeychan/elysia-logger";

import tleRoute from "./routes/tle";
import noradRoute from "./routes/norad";

import index from "./pub/index.tsx";
import kv from "./utils/kv";
import config from "./utils/config";
import log from "./utils/logger";

new Elysia()
	.use(wrap(log))
	// Use HTML plugin for rendering the index page
	.use(html())
	.get("/styles.css", () => new Response(Bun.file(new URL("./pub/styles.css", import.meta.url)), { headers: { "Content-Type": "text/css", "Cache-Control": "public, max-age=31536000" } }))
	.get("/favicon.ico", () => new Response(Bun.file(new URL("./pub/favicon.ico", import.meta.url)), { headers: { "Content-Type": "image/x-icon", "Cache-Control": "public, max-age=31536000" } }))
	.get("/", async () => {
		const activeGroups = [];
		for (const group of config.allowedGroups) {
			const timestamp = await kv.get(`${group}_timestamp`);
			const lastUpdate = timestamp ? new Date(timestamp).toISOString() : "Never";
			activeGroups.push({ name: group, lastUpdate });
		}
		return index({ activeGroups, cacheDuration: config.cacheDuration, maxReq: config.rateLimitMaxRequests, maxReqWindow: config.rateLimitWindow });
	})

	// Subroutes registers
	.use(tleRoute) // Import TLE routes
	.use(noradRoute) // Import NORAD routes

	.listen(config.port, () => {
		log.info(`Server is running on port ${config.port}`);
	});
