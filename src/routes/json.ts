import { Elysia } from "elysia";

import limiter from "../utils/ratelimiter";
import config from "../utils/config";
import groupHandler from "../utils/groupHandler";

const tleRoute = new Elysia({ prefix: "/json" })
	.use(limiter)
	.get("/", () => {
		return new Response(`Allowed groups: ${config.allowedGroups.join(", ")}`, {
			status: 200,
			headers: { "Content-Type": "text/plain" },
		});
	})
	.get("/:group", async (ctx) => {
		const group = ctx.params.group;
		const lastFetchedHeader = new Date(ctx.request.headers.get("If-Modified-Since") || 0).getTime();
		return await groupHandler.handleGroupRequest(group, lastFetchedHeader, "json");
	})
	.get("/:group/status", async (ctx) => {
		const group = ctx.params.group;
		return await groupHandler.handleGroupStatus(group, "json");
	});

export default tleRoute;
