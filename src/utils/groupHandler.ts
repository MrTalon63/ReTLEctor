import kv from "./kv";
import config from "./config";
import log from "./logger";
import tleFetcher from "./tleFetcher";

async function handleGroupRequest(group: string, lastFetchedHeader: number, format: "tle" | "json" | "csv") {
	if (config.allowedGroups.includes(group) === false) {
		return new Response(`Group "${group}" is not allowed.`, { status: 403 });
	}

	let timestamp = await kv.get(`${group}_timestamp_${format}`);
	const now = Date.now();
	const staleDuration = group === "active" ? config.cacheActiveDuration : config.cacheDuration;
	const isStale = timestamp ? now - timestamp > staleDuration : true;

	if (lastFetchedHeader && timestamp && lastFetchedHeader <= timestamp && !isStale) {
		log.debug(`GP data for group "${group}", format "${format}" not modified since last fetch. Returning 304.`);
		return new Response(null, { status: 304, headers: { "Last-Modified": new Date(timestamp).toUTCString(), "Cache-Control": `max-age=${group === "active" ? Math.ceil((config.cacheActiveDuration - (now - timestamp)) / 1000) : Math.ceil((config.cacheDuration - (now - timestamp)) / 1000)}` } });
	}

	let tle = await kv.get(`${group}_${format}`);

	if (!tle) {
		log.debug(`No cached GP data for group "${group}", format "${format}". Fetching from Celestrak...`);
		tle = await tleFetcher(group, format);
		// Re-read timestamp — fetcher only updates it on a successful upstream response
		timestamp = await kv.get(`${group}_timestamp_${format}`) ?? now;
	} else if (isStale) {
		log.debug(`GP data for group "${group}", format "${format}" are stale. Fetching fresh TLEs...`);
		tle = await tleFetcher(group, format);
		// Re-read timestamp — fetcher only updates it on a successful upstream response
		timestamp = await kv.get(`${group}_timestamp_${format}`) ?? timestamp;
	} else {
		log.debug(`Serving cached GP data for group "${group}", format "${format}".`);
	}

	const contentType = format === "json" ? "application/json" : "text/plain";

	const age = timestamp ? now - timestamp : 0;
	const maxAge = Math.max(0, group === "active"
		? Math.ceil((config.cacheActiveDuration - age) / 1000)
		: Math.ceil((config.cacheDuration - age) / 1000));

	return new Response(tle, {
		headers: { "Content-Type": contentType, "Last-Modified": new Date(timestamp).toUTCString(), "Cache-Control": `max-age=${maxAge}` },
	});
}

async function handleGroupStatus(group: string, format: "tle" | "json" | "csv") {
	if (config.allowedGroups.includes(group) === false) {
		return new Response(`Group "${group}" is not allowed.`, { status: 403 });
	}

	const timestamp = await kv.get(`${group}_timestamp_${format}`);
	if (!timestamp) {
		return new Response(`No cached TLEs for group "${group}".`, { status: 404 });
	}

	const now = Date.now();
	const age = Math.floor((now - timestamp) / 1000);
	const cacheDuration = group === "active" ? config.cacheActiveDuration : config.cacheDuration;
	const isStale = age > cacheDuration / 1000;
	const nextUpdate = new Date(timestamp + cacheDuration).toUTCString();

	return new Response(`Group: ${group}\nLast Updated: ${new Date(timestamp).toUTCString()}\nAge: ${age} seconds\nStatus: ${isStale ? "Stale" : "Fresh"}\nNext Update: ${nextUpdate}`, { status: 200, headers: { "Content-Type": "text/plain" } });
}

export default { handleGroupRequest, handleGroupStatus };
