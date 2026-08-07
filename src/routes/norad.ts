import { Elysia } from "elysia";

import tleGetter from "../utils/tleGetter";
import log from "../utils/logger";
import limiter from "../utils/ratelimiter";

const noradRoute = new Elysia({ prefix: "/norad" }).use(limiter).get("/:id", async ({ params }) => {
	const noradId = parseInt(params.id, 10);
	if (isNaN(noradId)) {
		return new Response("Invalid NORAD ID.", { status: 400 });
	}
	try {
		const tleData = await tleGetter(noradId);
		return new Response(tleData, { headers: { "Content-Type": "text/plain", "Cache-Control": "max-age=3600" } });
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		if (msg.includes("No TLE data found")) {
			return new Response(`No TLE data found for NORAD ID ${noradId}.`, { status: 404 });
		}
		log.error({ err: error }, `Failed to serve TLE for NORAD ID ${noradId}`);
		return new Response("Failed to retrieve TLE data. Upstream may be unavailable.", { status: 503 });
	}
});

export default noradRoute;
