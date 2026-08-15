import { Elysia } from "elysia";

import kv from "./kv";
import log from "./logger";
import config from "./config";

const limiter = new Elysia({ name: "rate-limiter" }).onRequest(async (ctx) => {
	const rawIp =
		ctx.request.headers.get("cf-connecting-ip") ||
		ctx.request.headers.get("true-client-ip") ||
		ctx.request.headers.get("x-real-ip") ||
		ctx.request.headers.get("x-forwarded-for") ||
		"unknown";
	const ip = rawIp.split(",")[0]?.trim() || "unknown";
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
				const retryAfterSeconds = Math.max(1, Math.ceil((clientInfo.startTime + windowSize - now) / 1000));
				return new Response("Too Many Requests", {
					status: 429,
					headers: {
						"X-RateLimit-Limit": String(maxRequests),
						"X-RateLimit-Remaining": "0",
						"X-RateLimit-Reset": String(Math.ceil((clientInfo.startTime + windowSize) / 1000)),
						"Retry-After": String(retryAfterSeconds),
					},
				});
			}
			ctx.set.headers = {
				"X-RateLimit-Limit": String(maxRequests),
				"X-RateLimit-Remaining": String(maxRequests - clientInfo.count),
				"X-RateLimit-Reset": String(Math.ceil((clientInfo.startTime + windowSize) / 1000)),
			};
			const remainingTtl = Math.max(1, windowSize - (now - clientInfo.startTime));
			await kv.set(key, clientInfo, remainingTtl);
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
