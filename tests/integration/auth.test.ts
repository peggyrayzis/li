/**
 * Integration tests for authentication commands.
 *
 * Tests the check and whoami commands with real LinkedIn credentials.
 * Skipped unless LINKEDIN_INTEGRATION_TEST=1 is set.
 */

import { describe, expect, it } from "vitest";
import { check } from "../../src/commands/check.js";
import { whoami } from "../../src/commands/whoami.js";
import { getCredentials, shouldRunIntegration } from "./setup.js";

describe.skipIf(!shouldRunIntegration)("auth integration", () => {
	it("validates session with check command", async () => {
		const credentials = await getCredentials();
		const result = await check(credentials, { json: true });

		const parsed = JSON.parse(result);
		expect(parsed).toHaveProperty("valid");
		expect(parsed).toHaveProperty("source");
		expect(parsed.valid).toBe(true);
		expect(typeof parsed.source).toBe("string");
	});

	it("returns profile with whoami command", async () => {
		const credentials = await getCredentials();
		const result = await whoami(credentials, { json: true });

		const parsed = JSON.parse(result);

		// Verify profile structure
		expect(parsed).toHaveProperty("profile");
		expect(parsed.profile).toHaveProperty("urn");
		expect(parsed.profile).toHaveProperty("username");
		expect(parsed.profile).toHaveProperty("firstName");
		expect(parsed.profile).toHaveProperty("lastName");
		expect(parsed.profile).toHaveProperty("headline");
		expect(parsed.profile).toHaveProperty("profileUrl");

		// Verify values are non-empty strings
		expect(typeof parsed.profile.username).toBe("string");
		expect(parsed.profile.username.length).toBeGreaterThan(0);
		expect(typeof parsed.profile.firstName).toBe("string");
		expect(parsed.profile.firstName.length).toBeGreaterThan(0);

		// Verify network info structure
		expect(parsed).toHaveProperty("networkInfo");
		expect(parsed.networkInfo).toHaveProperty("followersCount");
		expect(parsed.networkInfo).toHaveProperty("connectionsCount");
		expect(typeof parsed.networkInfo.followersCount).toBe("number");
		expect(typeof parsed.networkInfo.connectionsCount).toBe("number");
	});

	it("whoami profile URL is valid", async () => {
		const credentials = await getCredentials();
		const result = await whoami(credentials, { json: true });

		const parsed = JSON.parse(result);
		const profileUrl = parsed.profile.profileUrl;

		expect(profileUrl).toMatch(/^https:\/\/www\.linkedin\.com\/in\/[a-zA-Z0-9-]+$/);
	});
});
