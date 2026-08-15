import { Elysia, t } from "elysia";
import limiter from "../utils/ratelimiter";
import groupHandler from "../utils/groupHandler";
import { handleNoradRequest, normalizeOrbitFormat, isValidOrbitFormat } from "../utils/tleGetter";

function isNoradId(str: string): boolean {
	const clean = str.split(".")[0]?.trim() || "";
	if (/^\d+$/.test(clean) && parseInt(clean, 10) > 0) return true;
	if (/^[A-HJ-NP-Za-hj-np-z]\d{4}$/.test(clean)) return true;
	return false;
}

function cleanTarget(str: string): string {
	return str.split(".")[0]?.trim() || "";
}

function getLastFetchedHeader(req: Request): number {
	return new Date(req.headers.get("If-Modified-Since") || 0).getTime();
}

const orbitRoute = new Elysia()
	.use(limiter)

	// Status endpoint: /:target/status
	.get(
		"/:target/status",
		async (ctx) => {
			const target = cleanTarget(ctx.params.target);
			if (isNoradId(target)) {
				return new Response("Status check is only available for groups.", { status: 400 });
			}
			return await groupHandler.handleGroupStatus(target, "csv");
		},
		{
			params: t.Object({
				target: t.String({
					description: "Satellite group name (e.g. active, stations, visual, starlink, active-no-starlink)",
				}),
			}),
			detail: {
				tags: ["Orbital Data"],
				summary: "Get cache freshness status for a group",
				description: "Returns human-readable text indicating group cache freshness, last modified time, and next update window.",
			},
		},
	)

	// Format-specific endpoint: /:target/:format (e.g. /active/json, /25544/tle)
	.get(
		"/:target/:format",
		async (ctx) => {
			const target = cleanTarget(ctx.params.target);
			const rawFormat = ctx.params.format;

			if (rawFormat.toLowerCase() === "status") {
				if (isNoradId(target)) {
					return new Response("Status check is only available for groups.", { status: 400 });
				}
				return await groupHandler.handleGroupStatus(target, "csv");
			}

			if (!isValidOrbitFormat(rawFormat)) {
				return new Response(`Invalid format "${rawFormat}". Supported formats: csv, json, tle (or 3le), kvn. Default is csv.`, {
					status: 400,
					headers: { "Content-Type": "text/plain" },
				});
			}

			const format = normalizeOrbitFormat(rawFormat);

			if (isNoradId(target)) {
				return await handleNoradRequest(target, format);
			}

			const lastFetched = getLastFetchedHeader(ctx.request);
			return await groupHandler.handleGroupRequest(target, lastFetched, format);
		},
		{
			params: t.Object({
				target: t.String({
					description: "Satellite group name (e.g. active, stations) or NORAD Catalog ID (e.g. 25544)",
				}),
				format: t.String({
					description: "Desired output format: csv, json, tle (or 3le), kvn, or status",
				}),
			}),
			detail: {
				tags: ["Orbital Data"],
				summary: "Get orbital data by group or NORAD ID in specified format",
				description: "Retrieves cached orbital data for a satellite group or individual NORAD ID in CSV, JSON, 3LE, or KVN format.",
			},
		},
	)

	// Default endpoint (CSV): /:target (e.g. /active or /25544)
	.get(
		"/:target",
		async (ctx) => {
			const target = cleanTarget(ctx.params.target);

			if (isNoradId(target)) {
				return await handleNoradRequest(target, "csv");
			}

			const lastFetched = getLastFetchedHeader(ctx.request);
			return await groupHandler.handleGroupRequest(target, lastFetched, "csv");
		},
		{
			params: t.Object({
				target: t.String({
					description: "Satellite group name (e.g. active, stations) or NORAD Catalog ID (e.g. 25544)",
				}),
			}),
			detail: {
				tags: ["Orbital Data"],
				summary: "Get orbital data by group or NORAD ID in default format (CSV)",
				description: "Retrieves cached orbital data in CCSDS OMM CSV format.",
			},
		},
	);

export default orbitRoute;
