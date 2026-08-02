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
import { startTleCron } from "./utils/tleCron";
import { isCorruptTleValue } from "./utils/tleFetcher";
import { version } from "../package.json";

async function validateKvOnBootup(): Promise<void> {
	log.info("Validating KV store entries on bootup...");
	let purged = 0;

	for (const group of config.allowedGroups) {
		for (const format of config.formats) {
			const dataKey = `${group}_${format}`;
			const tsKey = `${group}_timestamp_${format}`;
			const value = (await kv.get(dataKey)) as string | null;

			if (isCorruptTleValue(value)) {
				if (value !== null && value !== undefined) {
					log.warn(`KV entry "${dataKey}" looks corrupt — purging (length=${value?.length ?? 0}, preview="${value?.slice(0, 60).replace(/\n/g, "\\n")}")`);
					await kv.delete(dataKey);
					await kv.delete(tsKey);
					purged++;
				}
			}
		}
	}

	if (purged > 0) {
		log.warn(`KV validation complete. Purged ${purged} corrupt entr${purged === 1 ? "y" : "ies"}.`);
	} else {
		log.info("KV validation complete. No corrupt entries found.");
	}
}

await validateKvOnBootup();
startTleCron();

const staticHeaders = { "Cache-Control": `public, max-age=${config.staticCacheMaxAge}` };

new Elysia()
	.use(wrap(log))
	// Use HTML plugin for rendering the index page
	.use(html())
	.get("/styles.css", () => new Response(Bun.file(new URL("./pub/styles.css", import.meta.url)), { headers: { ...staticHeaders, "Content-Type": "text/css" } }))
	.get("/favicon.ico", () => new Response(Bun.file(new URL("./pub/favicon.ico", import.meta.url)), { headers: { ...staticHeaders, "Content-Type": "image/x-icon" } }))
	.get("/retlector.png", () => new Response(Bun.file(new URL("./pub/retlector.png", import.meta.url)), { headers: { ...staticHeaders, "Content-Type": "image/png" } }))
	.get("/", async () => {
		const activeGroups = await Promise.all(
			config.allowedGroups.map(async (group) => {
				const [tleTimestamp, jsonTimestamp, csvTimestamp] = await Promise.all([
					kv.get(`${group}_timestamp_tle`),
					kv.get(`${group}_timestamp_json`),
					kv.get(`${group}_timestamp_csv`),
				]);
				const lastUpdateTle = tleTimestamp ? new Date(tleTimestamp).toISOString() : "Never";
				const lastUpdateJson = jsonTimestamp ? new Date(jsonTimestamp).toISOString() : "Never";
				const lastUpdateCsv = csvTimestamp ? new Date(csvTimestamp).toISOString() : "Never";
				return { name: group, lastUpdateTle, lastUpdateJson, lastUpdateCsv };
			})
		);
		return index({
			activeGroups,
			cacheDuration: config.cacheDuration,
			maxReq: config.rateLimitMaxRequests,
			maxReqWindow: config.rateLimitWindow,
			version,
			siteUrl: config.siteUrl,
			githubUrl: config.githubUrl,
			appName: config.appName,
		});
	})

	// Subroutes registers
	.use(tleRoute) // Import TLE routes
	.use(jsonRoute) // Import JSON routes
	.use(csvRoute) // Import CSV routes
	.use(noradRoute) // Import NORAD routes

	.listen(config.port, () => {
		log.info(`Server is running on port ${config.port}`);
	});
