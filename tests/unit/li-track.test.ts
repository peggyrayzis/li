import { describe, expect, it } from "vitest";
import { buildLiTrackHeader } from "../../src/lib/li-track.js";

describe("buildLiTrackHeader", () => {
	it("uses local timezone metadata instead of hardcoded values", () => {
		const parsed = JSON.parse(buildLiTrackHeader()) as {
			timezone: string;
			timezoneOffset: number;
		};
		const expectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
		const expectedOffset = Number((-new Date().getTimezoneOffset() / 60).toFixed(2));

		expect(parsed.timezone).toBe(expectedTimezone);
		expect(parsed.timezoneOffset).toBe(expectedOffset);
	});

	it("returns a compact tracking payload without static screen fingerprint fields", () => {
		const parsed = JSON.parse(buildLiTrackHeader()) as Record<string, unknown>;

		expect(parsed).toMatchObject({
			clientVersion: "0.2.3802",
			mpVersion: "0.2.3802",
			osName: "web",
			deviceFormFactor: "DESKTOP",
			mpName: "web",
		});
		expect(parsed).not.toHaveProperty("displayWidth");
		expect(parsed).not.toHaveProperty("displayHeight");
		expect(parsed).not.toHaveProperty("displayDensity");
	});
});
