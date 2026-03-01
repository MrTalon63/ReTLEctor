import { Elysia } from "elysia";

import tleGetter from "../utils/tleGetter";

const noradRoute = new Elysia({ prefix: "/norad" }).get("/:id", async ({ params }) => {
	const noradId = parseInt(params.id, 10);
	const tleData = await tleGetter(noradId);
	return new Response(tleData, { headers: { "Content-Type": "text/plain", "Cache-Control": "max-age=3600" } });
});

export default noradRoute;
