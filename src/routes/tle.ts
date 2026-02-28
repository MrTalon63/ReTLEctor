import { Elysia } from "elysia";

import limiter from "../utils/ratelimiter";
import config from "../utils/config";
import kv from "../utils/kv";
import log from "../utils/logger";
import tleFetcher from "../utils/tleFetcher";

const tleRoute = new Elysia({ prefix: "/tle" })
	.use(limiter)
	.get("/", () => {
		return new Response(`Allowed groups: ${config.allowedGroups.join(", ")}`, { status: 200, headers: { "Content-Type": "text/plain" } });
	})
	.get("/:group", async (ctx) => {
		const group = ctx.params.group;
		if (config.allowedGroups.includes(group) === false) {
			return new Response(`Group "${group}" is not allowed.`, { status: 403 });
		}

		let timestamp = await kv.get(`${group}_timestamp`);
		const now = Date.now();
		const staleDuration = group === "active" ? config.cacheActiveDuration : config.cacheDuration;
		const isStale = timestamp ? now - timestamp > staleDuration : true;
		const lastFetchedHeader = new Date(ctx.request.headers.get("If-Modified-Since") || 0).getTime();

		if (lastFetchedHeader && timestamp && lastFetchedHeader <= timestamp && !isStale) {
			log.info(`TLEs for group "${group}" not modified since last fetch. Returning 304.`);
			return new Response(null, { status: 304, headers: { "Last-Modified": new Date(timestamp).toUTCString(), "Cache-Control": `max-age=${group === "active" ? Math.ceil((config.cacheActiveDuration - (now - timestamp)) / 1000) : Math.ceil((config.cacheDuration - (now - timestamp)) / 1000)}` } });
		}

		let tle = await kv.get(group);

		if (!tle) {
			log.info(`No cached TLEs for group "${group}". Fetching from Celestrak...`);
			tle = await tleFetcher(group);
			timestamp = now;
			kv.set(group, tle);
			kv.set(`${group}_timestamp`, timestamp);
		} else if (isStale) {
			log.info(`TLEs for group "${group}" are stale. Fetching fresh TLEs...`);
			tle = await tleFetcher(group);
			timestamp = now;
			kv.set(group, tle);
			kv.set(`${group}_timestamp`, timestamp);
		} else {
			log.info(`Serving cached TLEs for group "${group}".`);
		}

		return new Response(tle, {
			headers: { "Content-Type": "text/plain", "Last-Modified": new Date(timestamp).toUTCString(), "Cache-Control": `max-age=${group === "active" ? Math.ceil((config.cacheActiveDuration - (now - timestamp)) / 1000) : Math.ceil((config.cacheDuration - (now - timestamp)) / 1000)}` },
		});
	})
	.get("/:group/status", async (ctx) => {
		const group = ctx.params.group;
		if (config.allowedGroups.includes(group) === false) {
			return new Response(`Group "${group}" is not allowed.`, { status: 403 });
		}

		const timestamp = await kv.get(`${group}_timestamp`);
		if (!timestamp) {
			return new Response(`No cached TLEs for group "${group}".`, { status: 404 });
		}

		const now = Date.now();
		const age = Math.floor((now - timestamp) / 1000);
		const cacheDuration = group === "active" ? config.cacheActiveDuration : config.cacheDuration;
		const isStale = age > cacheDuration / 1000;
		const nextUpdate = new Date(timestamp + cacheDuration).toUTCString();

		return new Response(`Group: ${group}\nLast Updated: ${new Date(timestamp).toUTCString()}\nAge: ${age} seconds\nStatus: ${isStale ? "Stale" : "Fresh"}\nNext Update: ${nextUpdate}`, { status: 200, headers: { "Content-Type": "text/plain" } });
	});

export default tleRoute;
