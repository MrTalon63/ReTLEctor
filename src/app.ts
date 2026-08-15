import { Elysia } from "elysia";
import { openapi } from "@elysiajs/openapi";
import { html } from "@elysiajs/html";
import { wrap } from "@bogeychan/elysia-logger";

import orbitRoute from "./routes/orbit";
import apiRoute from "./routes/api";

import index from "./pub/index.tsx";
import kv from "./utils/kv";
import config from "./utils/config";
import log from "./utils/logger";
import { getTleFreshnessStatus } from "./utils/tleStatus";
import { isDerivedGroup, getSourceGroup } from "./utils/derivedGroup";
import { version } from "../package.json";

const staticHeaders = { "Cache-Control": `public, max-age=${config.staticCacheMaxAge}` };

export const app = new Elysia()
	.use(
		openapi({
			path: "/openapi",
			specPath: "/openapi/json",
			scalar: {
				url: "/openapi/json",
				spec: {
					url: "/openapi/json",
				},
			},
			documentation: {
				info: {
					title: `${config.appName} API`,
					version,
					description: "Celestrak orbital data caching proxy and OpenAPI specification.",
				},
				tags: [
					{ name: "API", description: "Metadata and discovery endpoints" },
					{ name: "Orbital Data", description: "Satellite group and NORAD ID orbital data retrieval" },
				],
			},
			exclude: {
				paths: ["/styles.css", "/favicon.ico", "/retlector.png"],
			},
		}),
	)
	.use(wrap(log))
	.use(html())
	.get(
		"/styles.css",
		() =>
			new Response(Bun.file(new URL("./pub/styles.css", import.meta.url)), {
				headers: { ...staticHeaders, "Content-Type": "text/css" },
			}),
		{ detail: { hide: true } },
	)
	.get(
		"/favicon.ico",
		() =>
			new Response(Bun.file(new URL("./pub/favicon.ico", import.meta.url)), {
				headers: { ...staticHeaders, "Content-Type": "image/x-icon" },
			}),
		{ detail: { hide: true } },
	)
	.get(
		"/retlector.png",
		() =>
			new Response(Bun.file(new URL("./pub/retlector.png", import.meta.url)), {
				headers: { ...staticHeaders, "Content-Type": "image/png" },
			}),
		{ detail: { hide: true } },
	)
	.get(
		"/",
		async () => {
			const now = Date.now();
			const activeGroups = await Promise.all(
				config.allowedGroups.map(async (group) => {
					const sourceGroup = isDerivedGroup(group) ? getSourceGroup(group) : group;

					const csvTimestamp = await kv.get(`${sourceGroup}_timestamp_csv`);
					const status = getTleFreshnessStatus(csvTimestamp as string | number | null, group, now);
					return {
						name: group,
						lastUpdate: status.isoDate,
						status,
					};
				}),
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
		},
		{ detail: { hide: true } },
	)
	.get("/api/openapi", ({ redirect }) => redirect("/openapi"), { detail: { hide: true } })
	.get("/api/openapi/json", ({ redirect }) => redirect("/openapi/json"), { detail: { hide: true } })

	// Subroutes registers
	.use(apiRoute) // Import API routes
	.use(orbitRoute); // Import unified orbital data routes (/:group/:format, /:noradId/:format)

export type App = typeof app;
export default app;
