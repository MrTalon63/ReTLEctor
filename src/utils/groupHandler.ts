import kv from "./kv";
import config from "./config";
import log from "./logger";
import tleFetcher from "./tleFetcher";
import { isDerivedGroup, getSourceGroup, getDerivedGroupFormat, getDerivedGroupTimestamp } from "./derivedGroup";
import type { OrbitFormat } from "./tleGetter";

function normalizeGroupName(rawGroup: string): string {
	if (!rawGroup) return "";
	const parts = rawGroup.split(".");
	return parts[0] ?? "";
}

async function handleGroupRequest(rawGroup: string, lastFetchedHeader: number, format: OrbitFormat) {
	const group = normalizeGroupName(rawGroup);
	if (config.allowedGroups.includes(group) === false) {
		return new Response(`Group "${group}" not found.`, { status: 404 });
	}

	if (isDerivedGroup(group)) {
		const sourceTimestamp = await getDerivedGroupTimestamp(group);
		if (!sourceTimestamp) {
			return new Response(`Source group for derived group "${group}" has no cached data.`, { status: 404 });
		}

		if (lastFetchedHeader && !isNaN(lastFetchedHeader) && sourceTimestamp <= lastFetchedHeader) {
			log.debug(`Derived group "${group}" not modified since last fetch. Returning 304.`);
			return new Response(null, {
				status: 304,
				headers: {
					"Last-Modified": new Date(sourceTimestamp).toUTCString(),
					"Cache-Control": `max-age=${Math.ceil((config.cacheDuration - (Date.now() - sourceTimestamp)) / 1000)}`,
				},
			});
		}

		try {
			const data = await getDerivedGroupFormat(group, format);
			const contentType = format === "json" ? "application/json" : "text/plain";
			const age = Date.now() - sourceTimestamp;
			const maxAge = Math.max(0, Math.ceil((config.cacheDuration - age) / 1000));

			return new Response(data, {
				headers: {
					"Content-Type": contentType,
					"Last-Modified": new Date(sourceTimestamp).toUTCString(),
					"Cache-Control": `max-age=${maxAge}`,
				},
			});
		} catch (err) {
			log.error({ err }, `Failed to derive group "${group}" format "${format}".`);
			return new Response(`Failed to derive data for group "${group}".`, { status: 503 });
		}
	}

	const queryType = config.specialGroups.includes(group) ? "SPECIAL" : "GROUP";

	const csvTimestamp = (await kv.get(`${group}_timestamp_csv`)) as number | null;
	const now = Date.now();
	const staleDuration = group === "active" ? config.cacheActiveDuration : config.cacheDuration;
	const isStale = csvTimestamp ? now - csvTimestamp > staleDuration : true;

	let timestamp = csvTimestamp;

	if (lastFetchedHeader && !isNaN(lastFetchedHeader) && timestamp && timestamp <= lastFetchedHeader && !isStale) {
		log.debug(`Orbital data for group "${group}", format "${format}" not modified since last fetch. Returning 304.`);
		return new Response(null, {
			status: 304,
			headers: {
				"Last-Modified": new Date(timestamp).toUTCString(),
				"Cache-Control": `max-age=${group === "active" ? Math.ceil((config.cacheActiveDuration - (now - timestamp)) / 1000) : Math.ceil((config.cacheDuration - (now - timestamp)) / 1000)}`,
			},
		});
	}

	let tle = (await kv.get(`${group}_${format}`)) as string | null;

	if (!tle) {
		log.debug(`No cached orbital data for group "${group}", format "${format}". Fetching from Celestrak...`);
		try {
			tle = await tleFetcher(group, format, queryType);
			timestamp = (await kv.get(`${group}_timestamp_csv`)) as number | null;
		} catch (err) {
			log.error({ err }, `Failed to fetch group "${group}" format "${format}" from upstream with no cached data.`);
			return new Response(`Failed to fetch data for group "${group}". Upstream Celestrak may be unavailable.`, { status: 503 });
		}
	} else if (isStale) {
		log.debug(`Orbital data for group "${group}", format "${format}" is stale. Fetching fresh data...`);
		try {
			tle = await tleFetcher(group, format, queryType);
			timestamp = (await kv.get(`${group}_timestamp_csv`)) as number | null;
		} catch (err) {
			log.warn({ err }, `Failed to refresh stale orbital data for group "${group}", format "${format}". Serving stale cache.`);
		}
	} else {
		log.debug(`Serving cached orbital data for group "${group}", format "${format}".`);
	}

	const contentType = format === "json" ? "application/json" : "text/plain";
	const currentNow = Date.now();
	const age = timestamp ? currentNow - timestamp : 0;
	const maxAge = Math.max(
		0,
		group === "active" ? Math.ceil((config.cacheActiveDuration - age) / 1000) : Math.ceil((config.cacheDuration - age) / 1000),
	);

	return new Response(tle, {
		headers: {
			"Content-Type": contentType,
			"Last-Modified": new Date(timestamp ?? currentNow).toUTCString(),
			"Cache-Control": `max-age=${maxAge}`,
		},
	});
}

async function handleGroupStatus(rawGroup: string, format: OrbitFormat = "csv") {
	const group = normalizeGroupName(rawGroup);
	if (config.allowedGroups.includes(group) === false) {
		return new Response(`Group "${group}" not found.`, { status: 404 });
	}

	if (isDerivedGroup(group)) {
		const sourceTimestamp = await getDerivedGroupTimestamp(group);
		if (!sourceTimestamp) {
			return new Response(`No cached data for derived group "${group}" (source group has no data).`, { status: 404 });
		}

		const now = Date.now();
		const age = Math.floor((now - sourceTimestamp) / 1000);
		const cacheDuration = config.cacheDuration;
		const isStale = age > cacheDuration / 1000;
		const nextUpdate = new Date(sourceTimestamp + cacheDuration).toUTCString();

		return new Response(
			`Group: ${group} (derived from "${getSourceGroup(group)}")\nLast Updated: ${new Date(sourceTimestamp).toUTCString()}\nAge: ${age} seconds\nStatus: ${isStale ? "Stale" : "Fresh"}\nNext Update: ${nextUpdate}`,
			{ status: 200, headers: { "Content-Type": "text/plain" } },
		);
	}

	const timestamp = (await kv.get(`${group}_timestamp_csv`)) as number | null;
	if (!timestamp) {
		return new Response(`No cached orbital data for group "${group}".`, { status: 404 });
	}

	const now = Date.now();
	const age = Math.floor((now - timestamp) / 1000);
	const cacheDuration = group === "active" ? config.cacheActiveDuration : config.cacheDuration;
	const isStale = age > cacheDuration / 1000;
	const nextUpdate = new Date(timestamp + cacheDuration).toUTCString();

	return new Response(
		`Group: ${group}\nLast Updated: ${new Date(timestamp).toUTCString()}\nAge: ${age} seconds\nStatus: ${isStale ? "Stale" : "Fresh"}\nNext Update: ${nextUpdate}`,
		{ status: 200, headers: { "Content-Type": "text/plain" } },
	);
}

export default { handleGroupRequest, handleGroupStatus };
