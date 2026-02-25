import Keyv from "keyv";
import { KeyvFile } from "keyv-file";
import winston from "winston";

import index from "./index.html";

const kv = new Keyv({
	store: new KeyvFile({
		filename: process.env.KV_FILE || "./data/kv.json",
		writeDelay: 100,
	}),
});

const log = winston.createLogger({
	level: process.env.LOG_LEVEL || "info",
	format: winston.format.combine(
		winston.format.timestamp(),
		winston.format.printf(({ timestamp, level, message }) => {
			return `${timestamp} [${level.toUpperCase()}]: ${message}`;
		}),
	),
	transports: [new winston.transports.Console()],
});

async function fetchTle(group: string) {
	const url = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=tle`;
	log.info(`Fetching TLEs for group "${group}" from Celestrak...`);
	try {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`Failed to fetch TLEs: ${response.status} ${response.statusText}`);
		}
		const tleData = await response.text();
		await kv.set(group, tleData);
		await kv.set(`${group}_timestamp`, Date.now());
		log.info(`Successfully cached TLEs for group "${group}".`);
		return tleData;
	} catch (error) {
		log.error(`Error fetching TLEs for group "${group}": ${error}`);
		throw error;
	}
}

const allowedGroups = process.env.ALLOWED_GROUPS ? process.env.ALLOWED_GROUPS.split(",").map((g) => g.trim()) : null;

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

async function limiter(req: Request, server: any) {
	const ip = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || req.headers.get("true-client-ip") || req.headers.get("x-real-ip") || "unknown";
	const key = `rate_limit:${ip}`;
	const now = Date.now();
	const windowSize = process.env.RATE_LIMIT_WINDOW ? parseInt(process.env.RATE_LIMIT_WINDOW) * 1000 : 60 * 1000;
	const maxRequests = process.env.RATE_LIMIT_MAX_REQUESTS ? parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) : 60;

	let requestData = await kv.get(key);
	if (!requestData) {
		requestData = { count: 1, startTime: now };
		await kv.set(key, requestData, windowSize);
	} else {
		if (now - requestData.startTime < windowSize) {
			requestData.count++;
			if (requestData.count > maxRequests) {
				log.warn(`Rate limit exceeded for IP ${ip}`);
				return {
					limited: new Response("Too Many Requests", { status: 429 }),
					headers: {
						"X-RateLimit-Limit": String(maxRequests),
						"X-RateLimit-Remaining": "0",
						"X-RateLimit-Reset": String(Math.ceil((requestData.startTime + windowSize) / 1000)),
					},
				};
			}
			await kv.set(key, requestData, windowSize - (now - requestData.startTime));
		} else {
			requestData = { count: 1, startTime: now };
			await kv.set(key, requestData, windowSize);
		}
	}

	return {
		limited: null,
		headers: {
			"X-RateLimit-Limit": String(maxRequests),
			"X-RateLimit-Remaining": String(maxRequests - requestData.count),
			"X-RateLimit-Reset": String(Math.ceil((requestData.startTime + windowSize) / 1000)),
		},
	};
}

Bun.serve({
	port: PORT,
	development: process.env.NODE_ENV !== "production",
	routes: {
		"/": index,

		"/tle": async (req) => {
			return new Response(`Allowed groups: ${allowedGroups?.join(", ")}`, { status: 200 });
		},

		"/tle/:group": async (req, server) => {
			const limited = await limiter(req, server);
			if (limited.limited) {
				return limited.limited;
			}

			const group = req.params.group;
			try {
				if (allowedGroups?.includes(group) === false) {
					return new Response(`Group "${group}" is not allowed.`, { status: 403, headers: limited.headers });
				}
				let tleData = await kv.get(group);
				const timestamp = await kv.get(`${group}_timestamp`);
				const now = Date.now();

				if (!tleData || !timestamp || now - timestamp > (process.env.CACHE_DURATION ? parseInt(process.env.CACHE_DURATION) * 1000 : 24 * 60 * 60 * 1000)) {
					tleData = await fetchTle(group);
				} else {
					log.info(`Serving cached TLEs for group "${group}".`);
				}

				return new Response(tleData, {
					headers: { "Content-Type": "text/plain", ...limited.headers },
				});
			} catch (error) {
				return new Response(`Error fetching TLEs for group "${group}": ${error}`, { status: 500, headers: limited.headers });
			}
		},

		"/tle/:group/status": async (req, server) => {
			const limited = await limiter(req, server);
			if (limited.limited) {
				return limited.limited;
			}

			const group = req.params.group;
			try {
				if (allowedGroups?.includes(group) === false) {
					return new Response(`Group "${group}" is not allowed.`, { status: 403, headers: limited.headers });
				}
				const timestamp = await kv.get(`${group}_timestamp`);
				if (!timestamp) {
					return new Response(`No cached TLEs for group "${group}".`, { status: 404, headers: limited.headers });
				}
				return new Response(`Cached TLEs for group "${group}" are available.\nLast updated: ${new Date(timestamp).toUTCString()}`, { status: 200, headers: limited.headers });
			} catch (error) {
				return new Response(`Error fetching TLEs for group "${group}": ${error}`, { status: 500, headers: limited.headers });
			}
		},
	},
});

log.info(`Server is running on http://0.0.0.0:${PORT}`);
