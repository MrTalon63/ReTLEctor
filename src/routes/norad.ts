import { Elysia } from "elysia";

import limiter from "../utils/ratelimiter";
import tleGetter from "../utils/tleGetter";

const noradRoute = new Elysia({ prefix: "/norad" })
	.use(limiter)
	.get("/:id", async ({ params }) => {
		const noradId = parseInt(params.id, 10);

		if (isNaN(noradId) || noradId < 1 || noradId > 999999) {
			return new Response("Invalid NORAD ID. Must be a positive integer between 1 and 999999.", {
				status: 400,
				headers: { "Content-Type": "text/plain" },
			});
		}

		const tleData = await tleGetter(noradId);
		return new Response(tleData, { headers: { "Content-Type": "text/plain", "Cache-Control": "max-age=3600" } });
	});

export default noradRoute;
