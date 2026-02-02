import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LinkedInCredentials } from "../../../src/lib/auth.js";

// Load fixtures
import meFixture from "../../fixtures/me.json";
import networkInfoFixture from "../../fixtures/networkinfo.json";

const mockCredentials: LinkedInCredentials = {
	liAt: "AQE-test-li-at-token",
	jsessionId: "ajax:1234567890123456789",
	cookieHeader: 'li_at=AQE-test-li-at-token; JSESSIONID="ajax:1234567890123456789"',
	csrfToken: "ajax:1234567890123456789",
	source: "env",
};

// Mock request function - hoisted for use in mock factory
const mockRequest = vi.fn();

// Mock the client module with a class
vi.mock("../../../src/lib/client.js", () => ({
	LinkedInClient: class MockLinkedInClient {
		request = mockRequest;
	},
}));

import { whoami } from "../../../src/commands/whoami.js";

describe("whoami command", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("successful execution", () => {
		beforeEach(() => {
			// Mock /me endpoint
			mockRequest.mockImplementation((path: string) => {
				if (path === "/me") {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: () => Promise.resolve(meFixture),
					});
				}
				if (
					path ===
					"/graphql?includeWebMetadata=true&variables=(vanityName:peggyrayzis)&queryId=voyagerIdentityDashProfiles.a1a483e719b20537a256b6853cdca711"
				) {
					const payload = JSON.stringify({
						included: [{ followerCount: networkInfoFixture.followersCount }],
					});
					return Promise.resolve({
						ok: true,
						status: 200,
						json: () => Promise.resolve(JSON.parse(payload)),
						text: () => Promise.resolve(payload),
					});
				}
				return Promise.reject(new Error(`Unexpected path: ${path}`));
			});
		});

		it("calls /me endpoint to get current user", async () => {
			await whoami(mockCredentials);

			expect(mockRequest).toHaveBeenCalledWith("/me");
		});

		it("uses GraphQL for follower counts", async () => {
			await whoami(mockCredentials);

			expect(mockRequest).toHaveBeenCalledWith(
				"/graphql?includeWebMetadata=true&variables=(vanityName:peggyrayzis)&queryId=voyagerIdentityDashProfiles.a1a483e719b20537a256b6853cdca711",
			);
		});

		it("returns human-readable output by default", async () => {
			const result = await whoami(mockCredentials);

			// Should contain name
			expect(result).toContain("Peggy");
			expect(result).toContain("Rayzis");
			// Should contain username
			expect(result).toContain("@peggyrayzis");
			// Should contain headline
			expect(result).toContain("Developer marketing");
			// Network info from /networkinfo
			expect(result).toContain("4,821 followers");
			expect(result).toContain("500+ connections");
		});

		it("returns JSON output when --json flag is passed", async () => {
			const result = await whoami(mockCredentials, { json: true });

			const parsed = JSON.parse(result);
			expect(parsed.profile).toBeDefined();
			expect(parsed.profile.firstName).toBe("Peggy");
			expect(parsed.profile.lastName).toBe("Rayzis");
			expect(parsed.profile.username).toBe("peggyrayzis");
			// Network info from /networkinfo
			expect(parsed.networkInfo).toBeDefined();
			expect(parsed.networkInfo.followersCount).toBe(4821);
			expect(parsed.networkInfo.connectionsDisplay).toBe("500+");
		});
	});

	describe("error handling", () => {
		it("throws when /me request fails", async () => {
			mockRequest.mockRejectedValueOnce(new Error("Session expired"));

			await expect(whoami(mockCredentials)).rejects.toThrow("Session expired");
		});
	});

	describe("network counts fallback", () => {
		it("handles missing follower count but still returns connections", async () => {
			mockRequest.mockImplementation((path: string) => {
				if (path === "/me") {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: () => Promise.resolve(meFixture),
					});
				}
				if (
					path ===
					"/graphql?includeWebMetadata=true&variables=(vanityName:peggyrayzis)&queryId=voyagerIdentityDashProfiles.a1a483e719b20537a256b6853cdca711"
				) {
					const payload = JSON.stringify({ included: [] });
					return Promise.resolve({
						ok: true,
						status: 200,
						json: () => Promise.resolve(JSON.parse(payload)),
						text: () => Promise.resolve(payload),
					});
				}
				return Promise.reject(new Error(`Unexpected path: ${path}`));
			});

			const result = await whoami(mockCredentials);

			expect(result).toContain("0 followers");
			expect(result).toContain("500+ connections");
		});
	});
});
