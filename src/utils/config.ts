import { version } from "../../package.json";

const contact = process.env.CONTACT_EMAIL || process.env.CONTACT_INFO || process.env.OPERATOR_CONTACT || null;

const config = {
	allowedGroups: Array.from(
		new Set([
			"active",
			"active-no-starlink",
			...(process.env.ALLOWED_GROUPS
				? process.env.ALLOWED_GROUPS.split(",")
						.map((g) => g.trim())
						.filter(Boolean)
				: []),
		]),
	),
	specialGroups: process.env.SPECIAL_GROUPS
		? process.env.SPECIAL_GROUPS.split(",")
				.map((g) => g.trim())
				.filter(Boolean)
		: ["gpz", "gpz-plus", "decaying"],

	derivedGroups: {
		"active-no-starlink": {
			source: "active",
			filter: (name: string) => !name.toUpperCase().startsWith("STARLINK"),
		},
	} as const,
	formats: ["tle", "json", "csv", "kvn"] as const,
	logLevel: process.env.LOG_LEVEL || "info",
	port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
	redisUri: process.env.REDIS_URI || null,
	kvFile: process.env.KV_FILE || "./data/kv.json",
	kvWriteDelay: process.env.KV_WRITE_DELAY ? parseInt(process.env.KV_WRITE_DELAY) : 100,
	kvBatchSize: process.env.KV_BATCH_SIZE ? parseInt(process.env.KV_BATCH_SIZE) : 100,
	lokiUri: process.env.LOKI_URI || null,
	lokiAuth: process.env.LOKI_AUTH || undefined,
	rateLimitWindow: process.env.RATE_LIMIT_WINDOW ? parseInt(process.env.RATE_LIMIT_WINDOW) * 1000 : 60 * 1000,
	rateLimitMaxRequests: process.env.RATE_LIMIT_MAX_REQUESTS ? parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) : 60,
	cacheDuration: process.env.CACHE_DURATION ? parseInt(process.env.CACHE_DURATION) * 1000 : 12 * 60 * 60 * 1000,
	cacheActiveDuration: process.env.CACHE_ACTIVE_DURATION ? parseInt(process.env.CACHE_ACTIVE_DURATION) * 1000 : 4 * 60 * 60 * 1000,
	cacheNoradDuration: process.env.CACHE_NORAD_DURATION ? parseInt(process.env.CACHE_NORAD_DURATION) * 1000 : 24 * 60 * 60 * 1000,
	maxStorageAge: process.env.MAX_STORAGE_AGE
		? parseInt(process.env.MAX_STORAGE_AGE) < 365
			? parseInt(process.env.MAX_STORAGE_AGE) * 24 * 60 * 60 * 1000
			: parseInt(process.env.MAX_STORAGE_AGE) * 1000
		: 14 * 24 * 60 * 60 * 1000,
	cronInterval: process.env.CRON_INTERVAL ? parseInt(process.env.CRON_INTERVAL) * 1000 : 60 * 60 * 1000,
	cronJitter: process.env.CRON_JITTER ? parseInt(process.env.CRON_JITTER) * 1000 : 15 * 60 * 1000,
	celestrakUrl: process.env.CELESTRAK_URL || "https://celestrak.org/NORAD/elements/gp.php",
	celestrakMaxDirectRequests: process.env.CELESTRAK_MAX_DIRECT_REQUESTS ? parseInt(process.env.CELESTRAK_MAX_DIRECT_REQUESTS) : 25,
	siteUrl: process.env.SITE_URL || "",
	githubUrl: process.env.GITHUB_URL || "https://github.com/MrTalon63/ReTLEctor",
	appName: process.env.APP_NAME || "ReTLEctor",
	staticCacheMaxAge: process.env.STATIC_CACHE_MAX_AGE ? parseInt(process.env.STATIC_CACHE_MAX_AGE) : 86400,
	celestrakLockDuration:
		process.env.CELESTRAK_LOCK_DURATION || process.env.CELESTRACK_LOCK_DURATION
			? parseInt(process.env.CELESTRAK_LOCK_DURATION || process.env.CELESTRACK_LOCK_DURATION!) * 1000
			: 12 * 60 * 60 * 1000,
	contactInfo: contact,
	userAgent: contact
		? `ReTLEctor/${version} (${contact}; +${process.env.GITHUB_URL || "https://github.com/MrTalon63/ReTLEctor"})`
		: `ReTLEctor/${version} (unconfigured-contact; +${process.env.GITHUB_URL || "https://github.com/MrTalon63/ReTLEctor"})`,
};

export default config;
