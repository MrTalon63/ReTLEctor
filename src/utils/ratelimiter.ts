import { Elysia } from "elysia";

import kv from "./kv";
import log from "./logger";
import config from "./config";

const limiter = new Elysia({ name: "rate-limiter" }).onRequest(async (ctx) => {
	const ip = ctx.request.headers.get("x-forwarded-for") || ctx.request.headers.get("cf-connecting-ip") || ctx.request.headers.get("true-client-ip") || ctx.request.headers.get("x-real-ip") || "unknown";
	const key = `rate_limit:${ip}`;
	const now = Date.now();
	const windowSize = config.rateLimitWindow;
	const maxRequests = config.rateLimitMaxRequests;

	let clientInfo = await kv.get(key);
	if (!clientInfo) {
		clientInfo = { count: 1, startTime: now };
		await kv.set(key, clientInfo, windowSize);
		ctx.set.headers = {
			"X-RateLimit-Limit": String(maxRequests),
			"X-RateLimit-Remaining": String(maxRequests - clientInfo.count),
			"X-RateLimit-Reset": String(Math.ceil((clientInfo.startTime + windowSize) / 1000)),
		};
	} else {
		if (now - clientInfo.startTime < windowSize) {
			clientInfo.count++;
			if (clientInfo.count > maxRequests) {
				log.debug(`Rate limit exceeded for IP ${ip}`);
				return new Response("Too Many Requests", {
					status: 429,
					headers: {
						"X-RateLimit-Limit": String(maxRequests),
						"X-RateLimit-Remaining": "0",
						"X-RateLimit-Reset": String(Math.ceil((clientInfo.startTime + windowSize) / 1000)),
					},
				});
			}
			ctx.set.headers = {
				"X-RateLimit-Limit": String(maxRequests),
				"X-RateLimit-Remaining": String(maxRequests - clientInfo.count),
				"X-RateLimit-Reset": String(Math.ceil((clientInfo.startTime + windowSize) / 1000)),
			};
			await kv.set(key, clientInfo, windowSize - (now - clientInfo.startTime));
		} else {
			clientInfo = { count: 1, startTime: now };
			ctx.set.headers = {
				"X-RateLimit-Limit": String(maxRequests),
				"X-RateLimit-Remaining": String(maxRequests - clientInfo.count),
				"X-RateLimit-Reset": String(Math.ceil((clientInfo.startTime + windowSize) / 1000)),
			};
			await kv.set(key, clientInfo, windowSize);
		}
	}
});

export default limiter;
