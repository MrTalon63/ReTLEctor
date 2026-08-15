import { describe, expect, test } from "bun:test";
import { formatRelativeTime, getTleFreshnessStatus } from "../src/utils/tleStatus";
import config from "../src/utils/config";

describe("tleStatus utility", () => {
	test("formatRelativeTime formats durations correctly", () => {
		expect(formatRelativeTime(5000)).toBe("5s ago");
		expect(formatRelativeTime(120000)).toBe("2m ago");
		expect(formatRelativeTime(7200000)).toBe("2h ago");
		expect(formatRelativeTime(172800000)).toBe("2d ago");
	});

	test("getTleFreshnessStatus for active group (configured active threshold)", () => {
		const now = Date.now();
		const halfDuration = now - 0.5 * config.cacheActiveDuration;
		const oneAndHalfDuration = now - 1.5 * config.cacheActiveDuration;
		const tripleDuration = now - 3 * config.cacheActiveDuration;

		expect(getTleFreshnessStatus(halfDuration, "active", now).status).toBe("fresh");
		expect(getTleFreshnessStatus(oneAndHalfDuration, "active", now).status).toBe("stale");
		expect(getTleFreshnessStatus(tripleDuration, "active", now).status).toBe("expired");
		expect(getTleFreshnessStatus(null, "active", now).status).toBe("never");
	});

	test("getTleFreshnessStatus for default group (configured threshold)", () => {
		const now = Date.now();
		const halfDuration = now - 0.5 * config.cacheDuration;
		const oneAndHalfDuration = now - 1.5 * config.cacheDuration;
		const tripleDuration = now - 3 * config.cacheDuration;

		expect(getTleFreshnessStatus(halfDuration, "visual", now).status).toBe("fresh");
		expect(getTleFreshnessStatus(oneAndHalfDuration, "visual", now).status).toBe("stale");
		expect(getTleFreshnessStatus(tripleDuration, "visual", now).status).toBe("expired");
	});
});
