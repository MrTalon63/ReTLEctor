const config = {
	allowedGroups: process.env.ALLOWED_GROUPS ? process.env.ALLOWED_GROUPS.split(",").concat("active") : ["active"],
	logLevel: process.env.LOG_LEVEL || "info",
	port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
	rateLimitWindow: process.env.RATE_LIMIT_WINDOW ? parseInt(process.env.RATE_LIMIT_WINDOW) * 1000 : 60 * 1000,
	rateLimitMaxRequests: process.env.RATE_LIMIT_MAX_REQUESTS ? parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) : 60,
	cacheDuration: process.env.CACHE_DURATION ? parseInt(process.env.CACHE_DURATION) * 1000 : 24 * 60 * 60 * 1000,
	cacheActiveDuration: process.env.CACHE_ACTIVE_DURATION ? parseInt(process.env.CACHE_ACTIVE_DURATION) * 1000 : 2 * 60 * 60 * 1000,
	cacheNoradDuration: process.env.CACHE_NORAD_DURATION ? parseInt(process.env.CACHE_NORAD_DURATION) * 1000 : 24 * 60 * 60 * 1000,
};

export default config;
