import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LinkedInCredentials } from "../../../src/lib/auth.js";

// Load fixtures
import meFixture from "../../fixtures/me.json";
import networkInfoFixture from "../../fixtures/networkinfo.json";

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
	const mockCredentials: LinkedInCredentials = {
		liAt: "AQE-test-li-at-token",
		jsessionId: "ajax:1234567890123456789",
		cookieHeader: 'li_at=AQE-test-li-at-token; JSESSIONID="ajax:1234567890123456789"',
		csrfToken: "ajax:1234567890123456789",
		source: "env",
	};

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
				// Mock /identity/profiles/{username}/networkinfo endpoint
				if (path.includes("/networkinfo")) {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: () => Promise.resolve(networkInfoFixture),
					});
				}
				return Promise.reject(new Error(`Unexpected path: ${path}`));
			});
		});

		it("calls /me endpoint to get current user", async () => {
			await whoami(mockCredentials);

			expect(mockRequest).toHaveBeenCalledWith("/me");
		});

		it("calls networkinfo endpoint with username from /me response", async () => {
			await whoami(mockCredentials);

			expect(mockRequest).toHaveBeenCalledWith("/identity/profiles/peggyrayzis/networkinfo");
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
			// Should contain follower and connection counts
			expect(result).toContain("4,821");
			expect(result).toContain("1,203");
		});

		it("returns JSON output when --json flag is passed", async () => {
			const result = await whoami(mockCredentials, { json: true });

			const parsed = JSON.parse(result);
			expect(parsed.profile).toBeDefined();
			expect(parsed.profile.firstName).toBe("Peggy");
			expect(parsed.profile.lastName).toBe("Rayzis");
			expect(parsed.profile.username).toBe("peggyrayzis");
			expect(parsed.networkInfo).toBeDefined();
			expect(parsed.networkInfo.followersCount).toBe(4821);
			expect(parsed.networkInfo.connectionsCount).toBe(1203);
		});
	});

	describe("error handling", () => {
		it("throws when /me request fails", async () => {
			mockRequest.mockRejectedValueOnce(new Error("Session expired"));

			await expect(whoami(mockCredentials)).rejects.toThrow("Session expired");
		});

		it("throws when networkinfo request fails", async () => {
			mockRequest
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: () => Promise.resolve(meFixture),
				})
				.mockRejectedValueOnce(new Error("Network error"));

			await expect(whoami(mockCredentials)).rejects.toThrow("Network error");
		});
	});
});
