import { describe, expect, test } from "bun:test";
import { formatRelativeTime, getTleFreshnessStatus } from "../src/utils/tleStatus";

describe("tleStatus utility", () => {
	test("formatRelativeTime formats durations correctly", () => {
		expect(formatRelativeTime(5000)).toBe("5s ago");
		expect(formatRelativeTime(120000)).toBe("2m ago");
		expect(formatRelativeTime(7200000)).toBe("2h ago");
		expect(formatRelativeTime(172800000)).toBe("2d ago");
	});

	test("getTleFreshnessStatus for active group (6h threshold)", () => {
		const now = Date.now();
		const oneHourAgo = now - 1 * 60 * 60 * 1000;
		const sevenHoursAgo = now - 7 * 60 * 60 * 1000;
		const fifteenHoursAgo = now - 15 * 60 * 60 * 1000;

		expect(getTleFreshnessStatus(oneHourAgo, "active", now).status).toBe("fresh");
		expect(getTleFreshnessStatus(sevenHoursAgo, "active", now).status).toBe("stale");
		expect(getTleFreshnessStatus(fifteenHoursAgo, "active", now).status).toBe("expired");
		expect(getTleFreshnessStatus(null, "active", now).status).toBe("never");
	});

	test("getTleFreshnessStatus for default group (24h threshold)", () => {
		const now = Date.now();
		const tenHoursAgo = now - 10 * 60 * 60 * 1000;
		const thirtyHoursAgo = now - 30 * 60 * 60 * 1000;
		const sixtyHoursAgo = now - 60 * 60 * 1000 * 1000;

		expect(getTleFreshnessStatus(tenHoursAgo, "visual", now).status).toBe("fresh");
		expect(getTleFreshnessStatus(thirtyHoursAgo, "visual", now).status).toBe("stale");
		expect(getTleFreshnessStatus(sixtyHoursAgo, "visual", now).status).toBe("expired");
	});
});
