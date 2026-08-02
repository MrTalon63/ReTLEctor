import { describe, expect, test } from "bun:test";
import { isCorruptTleValue, isNotModifiedNotice } from "../src/utils/tleFetcher";

describe("tleFetcher validation helpers", () => {
	const celestrakNoticeMessage = `GP data has not updated since your last successful
download of GROUP=active at 2026-08-02 16:34:48 UTC.
Data is updated once every 2 hours.`;

	test("isNotModifiedNotice identifies Celestrak plain-text notice", () => {
		expect(isNotModifiedNotice(celestrakNoticeMessage)).toBe(true);
		expect(isNotModifiedNotice("GP data has not updated")).toBe(true);
		expect(isNotModifiedNotice("Data is updated once every 2 hours.")).toBe(true);
		expect(isNotModifiedNotice("ISS (ZARYA)\n1 25544U...")).toBe(false);
	});

	test("isCorruptTleValue detects Celestrak notice as non-TLE payload", () => {
		expect(isCorruptTleValue(celestrakNoticeMessage)).toBe(true);
		expect(isCorruptTleValue("No GP data found")).toBe(true);
		expect(isCorruptTleValue("<html><body>Error</body></html>")).toBe(true);
		expect(isCorruptTleValue("")).toBe(true);
		expect(isCorruptTleValue(null)).toBe(true);
	});

	test("isCorruptTleValue allows valid TLE payload", () => {
		const validTle = `ISS (ZARYA)
1 25544U 98067A   26214.50000000  .00016717  00000-0  30000-3 0  9993
2 25544  51.6400 200.0000 0005000 100.0000 260.0000 15.49000000 10002`;
		expect(isCorruptTleValue(validTle)).toBe(false);
	});
});
