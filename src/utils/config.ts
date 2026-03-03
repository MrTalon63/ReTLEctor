const config = {
	allowedGroups: process.env.ALLOWED_GROUPS ? ["active", ...process.env.ALLOWED_GROUPS.split(",")] : ["active"],
	logLevel: process.env.LOG_LEVEL || "info",
	port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
	redisUri: process.env.REDIS_URI || null,
	kvFile: process.env.KV_FILE || "./data/kv.json",
	lokiUri: process.env.LOKI_URI || null,
	lokiAuth: process.env.LOKI_AUTH || undefined,
	rateLimitWindow: process.env.RATE_LIMIT_WINDOW ? parseInt(process.env.RATE_LIMIT_WINDOW) * 1000 : 60 * 1000,
	rateLimitMaxRequests: process.env.RATE_LIMIT_MAX_REQUESTS ? parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) : 60,
	cacheDuration: process.env.CACHE_DURATION ? parseInt(process.env.CACHE_DURATION) * 1000 : 24 * 60 * 60 * 1000,
	cacheActiveDuration: process.env.CACHE_ACTIVE_DURATION ? parseInt(process.env.CACHE_ACTIVE_DURATION) * 1000 : 2 * 60 * 60 * 1000,
	cacheNoradDuration: process.env.CACHE_NORAD_DURATION ? parseInt(process.env.CACHE_NORAD_DURATION) * 1000 : 24 * 60 * 60 * 1000,
};

export default config;
