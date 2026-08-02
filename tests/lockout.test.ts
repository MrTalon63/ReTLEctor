import { describe, expect, test, beforeEach } from "bun:test";
import kv from "../src/utils/kv";
import { isCelestrakLockedOut, triggerCelestrakLockout, LOCKOUT_KEY } from "../src/utils/lockout";

describe("Celestrak 24h Lockout", () => {
	beforeEach(async () => {
		await kv.delete(LOCKOUT_KEY);
	});

	test("isCelestrakLockedOut returns false when no lockout key exists", async () => {
		const status = await isCelestrakLockedOut();
		expect(status.locked).toBe(false);
	});

	test("triggerCelestrakLockout sets lockout key for 24 hours", async () => {
		const now = Date.now();
		const lockoutUntil = await triggerCelestrakLockout(429, "test context");

		expect(lockoutUntil).toBeGreaterThanOrEqual(now + 24 * 60 * 60 * 1000 - 1000);

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
});
