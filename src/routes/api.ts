import { Elysia, t } from "elysia";
import kv from "../utils/kv";
import config from "../utils/config";
import limiter from "../utils/ratelimiter";
import { isDerivedGroup, getSourceGroup } from "../utils/derivedGroup";
import { getTleFreshnessStatus } from "../utils/tleStatus";
import { version } from "../../package.json";

export interface FormatInfo {
	id: string;
	name: string;
	contentType: string;
	description: string;
	groupEndpoint: string;
	idEndpoint: string;
	isDefault: boolean;
}

export const FORMATS: FormatInfo[] = [
	{
		id: "csv",
		name: "CCSDS OMM CSV (Default)",
		contentType: "text/plain",
		description: "Consultative Committee for Space Data Systems Orbit Mean-Elements Message in CSV format.",
		groupEndpoint: "/:group/csv (or /:group)",
		idEndpoint: "/:noradId/csv (or /:noradId)",
		isDefault: true,
	},
	{
		id: "json",
		name: "CCSDS OMM JSON",
		contentType: "application/json",
		description: "Consultative Committee for Space Data Systems Orbit Mean-Elements Message in JSON format.",
		groupEndpoint: "/:group/json",
		idEndpoint: "/:noradId/json",
		isDefault: false,
	},
	{
		id: "tle",
		name: "Three-Line Element Set (3LE)",
		contentType: "text/plain",
		description: "Standard NORAD 3-line orbital element format (aliases: tle, 3le). Alpha5 encoded.",
		groupEndpoint: "/:group/tle",
		idEndpoint: "/:noradId/tle",
		isDefault: false,
	},
	{
		id: "kvn",
		name: "CCSDS OMM KVN",
		contentType: "text/plain",
		description: "Consultative Committee for Space Data Systems Orbit Mean-Elements Message in Key-Value Notation (KVN) format.",
		groupEndpoint: "/:group/kvn",
		idEndpoint: "/:noradId/kvn",
		isDefault: false,
	},
];

export async function getActiveGroupsData() {
	const now = Date.now();
	return await Promise.all(
		config.allowedGroups.map(async (group) => {
			const derived = isDerivedGroup(group);
			const sourceGroup = derived ? getSourceGroup(group) : group;
			const csvTimestamp = (await kv.get(`${sourceGroup}_timestamp_csv`)) as number | null;
			const status = getTleFreshnessStatus(csvTimestamp, group, now);
			const cacheDuration = group === "active" ? config.cacheActiveDuration : config.cacheDuration;
			const ageSeconds = csvTimestamp ? Math.floor((now - csvTimestamp) / 1000) : null;

			return {
				name: group,
				derived,
				source: derived ? sourceGroup : null,
				status: status.status,
				statusLabel: status.label,
				lastUpdated: status.isoDate,
				ageSeconds,
				cacheDurationSeconds: cacheDuration / 1000,
				endpoints: {
					default: `/${group}`,
					csv: `/${group}/csv`,
					json: `/${group}/json`,
					tle: `/${group}/tle`,
					kvn: `/${group}/kvn`,
					status: `/${group}/status`,
				},
			};
		}),
	);
}

const apiV1Route = new Elysia({ prefix: "/v1" })
	.use(limiter)
	.get(
		"/",
		() => {
			return {
				version,
				appName: config.appName,
				apiVersion: "v1",
				defaultFormat: "csv",
				endpoints: {
					groups: "/api/v1/groups",
					formats: "/api/v1/formats",
					groupLookup: "/:group[/:format]",
					idLookup: "/:noradId[/:format]",
					groupStatus: "/:group/status",
					openapi: "/openapi",
					openapiJson: "/openapi/json",
				},
			};
		},
		{
			response: t.Object(
				{
					version: t.String({ description: "Application version" }),
					appName: t.String({ description: "Application name" }),
					apiVersion: t.String({ description: "API version identifier" }),
					defaultFormat: t.String({ description: "Default orbital format" }),
					endpoints: t.Object(
						{
							groups: t.String(),
							formats: t.String(),
							groupLookup: t.String(),
							idLookup: t.String(),
							groupStatus: t.String(),
							openapi: t.String(),
							openapiJson: t.String(),
						},
						{ description: "Directory of available v1 endpoints" },
					),
				},
				{ description: "v1 API metadata and endpoint directory" },
			),
			detail: {
				tags: ["API"],
				summary: "v1 API index & endpoint directory",
				description: "Provides metadata and list of available v1 API endpoints.",
			},
		},
	)
	.get(
		"/formats",
		() => {
			return FORMATS;
		},
		{
			response: t.Array(
				t.Object({
					id: t.String({ description: "Format identifier (csv, json, tle, kvn)" }),
					name: t.String({ description: "Human-readable format name" }),
					contentType: t.String({ description: "MIME content type" }),
					description: t.String({ description: "Format description" }),
					groupEndpoint: t.String({ description: "Route template for group queries" }),
					idEndpoint: t.String({ description: "Route template for NORAD ID queries" }),
					isDefault: t.Boolean({ description: "Whether this format is the default" }),
				}),
				{ description: "List of supported orbital data formats" },
			),
			detail: {
				tags: ["API"],
				summary: "List supported orbital data formats",
				description: "Returns a list of all supported output formats (CSV, JSON, 3LE, KVN) and their metadata.",
			},
		},
	)
	.get(
		"/groups",
		async () => {
			const groups = await getActiveGroupsData();
			return {
				count: groups.length,
				groups,
			};
		},
		{
			response: t.Object(
				{
					count: t.Number({ description: "Total count of active and derived groups" }),
					groups: t.Array(
						t.Object({
							name: t.String({ description: "Group name" }),
							derived: t.Boolean({ description: "Whether this is a derived group filtered from another group" }),
							source: t.Nullable(t.String({ description: "Source group if derived, null otherwise" })),
							status: t.String({ description: "Freshness status code (fresh, stale, expired, never)" }),
							statusLabel: t.String({ description: "Human-readable freshness label" }),
							lastUpdated: t.String({ description: "ISO timestamp of last cache update or 'Never'" }),
							ageSeconds: t.Nullable(t.Number({ description: "Seconds elapsed since last cache update" })),
							cacheDurationSeconds: t.Number({ description: "Cache TTL in seconds" }),
							endpoints: t.Object({
								default: t.String(),
								csv: t.String(),
								json: t.String(),
								tle: t.String(),
								kvn: t.String(),
								status: t.String(),
							}),
						}),
					),
				},
				{ description: "Configured satellite groups with freshness status" },
			),
			detail: {
				tags: ["API"],
				summary: "List active and derived satellite groups",
				description: "Returns all configured satellite groups with cache status, update timestamps, and format endpoints.",
			},
		},
	);

const apiRoute = new Elysia({ prefix: "/api" })
	.use(limiter)
	.get(
		"/",
		() => {
			return {
				version,
				appName: config.appName,
				versions: ["v1"],
				latest: "/api/v1",
				openapi: "/openapi",
				openapiJson: "/openapi/json",
			};
		},
		{
			response: t.Object(
				{
					version: t.String({ description: "Application version" }),
					appName: t.String({ description: "Application name" }),
					versions: t.Array(t.String(), { description: "Available API versions" }),
					latest: t.String({ description: "Path to latest API version" }),
					openapi: t.String({ description: "OpenAPI UI documentation URL" }),
					openapiJson: t.String({ description: "OpenAPI JSON specification URL" }),
				},
				{ description: "API root discovery metadata" },
			),
			detail: {
				tags: ["API"],
				summary: "API version discovery",
				description: "Returns available API versions and links to the latest version and OpenAPI documentation.",
			},
		},
	)
	.use(apiV1Route);

export default apiRoute;
