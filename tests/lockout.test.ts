import { describe, expect, test, beforeEach } from "bun:test";
import kv from "../src/utils/kv";
import config from "../src/utils/config";
import { isCelestrakLockedOut, triggerCelestrakLockout, formatLockoutDuration, LOCKOUT_KEY } from "../src/utils/lockout";

describe("Celestrak Lockout", () => {
	beforeEach(async () => {
		await kv.delete(LOCKOUT_KEY);
	});

	test("isCelestrakLockedOut returns false when no lockout key exists", async () => {
		const status = await isCelestrakLockedOut();
		expect(status.locked).toBe(false);
	});

	test("triggerCelestrakLockout sets lockout key for configured duration", async () => {
		const now = Date.now();
		const lockoutUntil = await triggerCelestrakLockout(429, "test context");

		expect(lockoutUntil).toBeGreaterThanOrEqual(now + config.celestrakLockDuration - 1000);

		const status = await isCelestrakLockedOut();
		expect(status.locked).toBe(true);
		expect(status.untilMs).toBe(lockoutUntil);
		expect(status.untilIso).toBeDefined();
	});

	test("isCelestrakLockedOut clears expired lockout key", async () => {
		const expiredTime = Date.now() - 1000;
		await kv.set(LOCKOUT_KEY, expiredTime);

		const status = await isCelestrakLockedOut();
		expect(status.locked).toBe(false);

		const kvVal = await kv.get(LOCKOUT_KEY);
		expect(kvVal).toBeFalsy();
	});

	test("formatLockoutDuration formats hours and minutes correctly", () => {
		expect(formatLockoutDuration(12 * 60 * 60 * 1000)).toBe("12h");
		expect(formatLockoutDuration(24 * 60 * 60 * 1000)).toBe("24h");
		expect(formatLockoutDuration(30 * 60 * 1000)).toBe("30m");
		expect(formatLockoutDuration(90 * 60 * 1000)).toBe("1.5h");
	});
});
