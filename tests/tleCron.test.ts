import { describe, expect, test } from "bun:test";
import { getRandomJitter } from "../src/utils/tleCron";

describe("tleCron getRandomJitter", () => {
	test("returns 0 when maxJitterMs is 0 or negative", () => {
		expect(getRandomJitter(0)).toBe(0);
		expect(getRandomJitter(-100)).toBe(0);
	});

	test("returns value within range [0, maxJitterMs)", () => {
		for (let i = 0; i < 50; i++) {
			const jitter = getRandomJitter(5000);
			expect(jitter).toBeGreaterThanOrEqual(0);
			expect(jitter).toBeLessThan(5000);
		}
	});
});
