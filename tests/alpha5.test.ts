import { describe, expect, test } from "bun:test";
import { decode, encode } from "../src/utils/alpha5";

describe("alpha5 decode", () => {
	test("plain numeric designator", () => {
		expect(decode("1")).toBe(1);
		expect(decode("25544")).toBe(25544);
	});

	test("plain numeric with leading zeros", () => {
		expect(decode("00007")).toBe(7);
		expect(decode("00256")).toBe(256);
	});

	test("Alpha-5: A0000 == 100000", () => {
		expect(decode("A0000")).toBe(100000);
	});

	test("Alpha-5: A0123 == 100123", () => {
		expect(decode("A0123")).toBe(100123);
	});

	test("Alpha-5: B0000 == 110000", () => {
		expect(decode("B0000")).toBe(110000);
	});

	test("Alpha-5: H9999 == 179999 (last before I-skip)", () => {
		expect(decode("H9999")).toBe(179999);
	});

	test("Alpha-5: J0000 == 180000 (skips I)", () => {
		expect(decode("J0000")).toBe(180000);
	});

	test("Alpha-5: N9999 == 229999 (last before O-skip)", () => {
		expect(decode("N9999")).toBe(229999);
	});

	test("Alpha-5: P0000 == 230000 (skips O)", () => {
		expect(decode("P0000")).toBe(230000);
	});

	test("Alpha-5: Z9999 == 339999 (max)", () => {
		expect(decode("Z9999")).toBe(339999);
	});

	test("Space-Track spec examples", () => {
		expect(decode("100000")).toBe(100000);
		expect(decode("148493")).toBe(148493);
		expect(decode("182931")).toBe(182931);
		expect(decode("234018")).toBe(234018);
		expect(decode("301928")).toBe(301928);
		expect(decode("339999")).toBe(339999);
	});

	test("rejects I prefix (reserved)", () => {
		expect(() => decode("I0000")).toThrow(/Invalid NORAD/);
	});

	test("rejects O prefix (reserved)", () => {
		expect(() => decode("O0000")).toThrow(/Invalid NORAD/);
	});

	test("rejects lowercase letter prefix", () => {
		expect(() => decode("a0123")).toThrow(/Invalid NORAD/);
	});

	test("rejects empty string", () => {
		expect(() => decode("")).toThrow(/Invalid NORAD/);
	});

	test("rejects null", () => {
		expect(() => decode(null as any)).toThrow(/Invalid NORAD/);
	});

	test("rejects undefined", () => {
		expect(() => decode(undefined as any)).toThrow(/Invalid NORAD/);
	});

	test("rejects number input", () => {
		expect(() => decode(25544 as any)).toThrow(/Invalid NORAD/);
	});

	test("rejects letters in numeric tail", () => {
		expect(() => decode("Axxxx")).toThrow(/Invalid NORAD/);
	});

	test("rejects value exceeding max range", () => {
		expect(() => decode("340000")).toThrow(/exceeds Alpha-5/);
		expect(() => decode("999999")).toThrow(/exceeds Alpha-5/);
	});

	test("accepts zero-padded numeric strings of any length", () => {
		expect(decode("7")).toBe(7);
		expect(decode("07")).toBe(7);
		expect(decode("00007")).toBe(7);
	});

	test("accepts non-canonical numeric form for Alpha-5 values", () => {
		expect(decode("100000")).toBe(100000);
	});
});

describe("alpha5 encode", () => {
	test("plain numeric is zero-padded to 5 chars", () => {
		expect(encode(7)).toBe("00007");
		expect(encode(25544)).toBe("25544");
		expect(encode(99999)).toBe("99999");
	});

	test("Alpha-5: 100000 → A0000", () => {
		expect(encode(100000)).toBe("A0000");
	});

	test("Alpha-5: 100123 → A0123", () => {
		expect(encode(100123)).toBe("A0123");
	});

	test("Alpha-5: 110000 → B0000", () => {
		expect(encode(110000)).toBe("B0000");
	});

	test("Alpha-5: 180000 → J0000 (skips I)", () => {
		expect(encode(180000)).toBe("J0000");
	});

	test("Alpha-5: 230000 → P0000 (skips O)", () => {
		expect(encode(230000)).toBe("P0000");
	});

	test("Alpha-5: 339999 → Z9999 (max)", () => {
		expect(encode(339999)).toBe("Z9999");
	});

	test("format always produces exactly 5 characters", () => {
		const samples = [0, 7, 99, 999, 9999, 99999, 100000, 200000, 339999];
		for (const n of samples) {
			expect(encode(n)).toHaveLength(5);
		}
	});

	test("format never produces I or O", () => {
		for (let n = 100000; n <= 339999; n += 1) {
			const s = encode(n);
			expect(s).not.toMatch(/[IO]/);
		}
	});

	test("rejects negative", () => {
		expect(() => encode(-1)).toThrow(/Invalid NORAD/);
	});

	test("rejects NaN", () => {
		expect(() => encode(NaN)).toThrow(/Invalid NORAD/);
	});

	test("rejects non-integer", () => {
		expect(() => encode(1.5)).toThrow(/Invalid NORAD/);
	});

	test("rejects beyond Alpha-5 range", () => {
		expect(() => encode(340000)).toThrow(/exceeds Alpha-5/);
	});

	test("rejects non-number types", () => {
		expect(() => encode("100" as any)).toThrow(/Invalid NORAD/);
		expect(() => encode(null as any)).toThrow(/Invalid NORAD/);
		expect(() => encode(undefined as any)).toThrow(/Invalid NORAD/);
	});
});

describe("alpha5 round-trip", () => {
	test("decode(encode(n)) === n for full range", () => {
		const samples = [0, 7, 25544, 99999, 100000, 100123, 110000, 179999, 180000, 229999, 230000, 339999];
		for (const n of samples) {
			expect(decode(encode(n))).toBe(n);
		}
	});

	test("round-trip property: every 137th value in 0..339999", () => {
		for (let n = 0; n <= 339999; n += 137) {
			expect(decode(encode(n))).toBe(n);
		}
	});

	test("no gap across I-skip", () => {
		expect(decode(encode(179999))).toBe(179999);
		expect(decode(encode(180000))).toBe(180000);
		expect(decode(encode(180000))).toBe(decode("H9999") + 1);
	});

	test("no gap across O-skip", () => {
		expect(decode(encode(229999))).toBe(229999);
		expect(decode(encode(230000))).toBe(230000);
		expect(decode(encode(230000))).toBe(decode("N9999") + 1);
	});
});
