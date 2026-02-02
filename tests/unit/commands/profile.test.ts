import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { profile } from "../../../src/commands/profile.js";
import type { LinkedInCredentials } from "../../../src/lib/auth.js";

// Load fixture
import profileDashFixture from "../../fixtures/profile-dash.json";

const PROFILE_LOOKUP_FIXTURE = {
	elements: [
		{
			entityUrn: "urn:li:fsd_profile:ABC123",
			publicIdentifier: "peggyrayzis",
		},
	],
};

const PROFILE_DECORATION_ID =
	"com.linkedin.voyager.dash.deco.identity.profile.FullProfile-76";

describe("profile command", () => {
	const mockCredentials: LinkedInCredentials = {
		liAt: "AQE-test-li-at-token",
		jsessionId: "ajax:1234567890123456789",
		cookieHeader: 'li_at=AQE-test-li-at-token; JSESSIONID="ajax:1234567890123456789"',
		csrfToken: "ajax:1234567890123456789",
		source: "env",
	};

	let mockFetch: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		mockFetch = vi.fn();
		vi.stubGlobal("fetch", mockFetch);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	describe("input parsing", () => {
		it("handles plain username", async () => {
			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: async () => PROFILE_LOOKUP_FIXTURE,
				})
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: async () => profileDashFixture,
				});

			await profile(mockCredentials, "peggyrayzis");

			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining(
					"/identity/dash/profiles?q=memberIdentity&memberIdentity=peggyrayzis",
				),
				expect.any(Object),
			);
			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining(
					`/identity/dash/profiles/urn%3Ali%3Afsd_profile%3AABC123?decorationId=${PROFILE_DECORATION_ID}`,
				),
				expect.any(Object),
			);
		});

		it("handles profile URL", async () => {
			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: async () => PROFILE_LOOKUP_FIXTURE,
				})
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: async () => profileDashFixture,
				});

			await profile(mockCredentials, "https://www.linkedin.com/in/peggyrayzis");

			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining(
					"/identity/dash/profiles?q=memberIdentity&memberIdentity=peggyrayzis",
				),
				expect.any(Object),
			);
			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining(
					`/identity/dash/profiles/urn%3Ali%3Afsd_profile%3AABC123?decorationId=${PROFILE_DECORATION_ID}`,
				),
				expect.any(Object),
			);
		});

		it("handles profile URL with trailing slash", async () => {
			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: async () => PROFILE_LOOKUP_FIXTURE,
				})
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: async () => profileDashFixture,
				});

			await profile(mockCredentials, "https://www.linkedin.com/in/peggyrayzis/");

			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining(
					"/identity/dash/profiles?q=memberIdentity&memberIdentity=peggyrayzis",
				),
				expect.any(Object),
			);
			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining(
					`/identity/dash/profiles/urn%3Ali%3Afsd_profile%3AABC123?decorationId=${PROFILE_DECORATION_ID}`,
				),
				expect.any(Object),
			);
		});

		it("handles profile URN using profileByUrn endpoint", async () => {
			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: async () => PROFILE_LOOKUP_FIXTURE,
				})
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: async () => profileDashFixture,
				});

			await profile(mockCredentials, "urn:li:fsd_profile:ABC123");

			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining(
					"/identity/dash/profiles?q=memberIdentity&memberIdentity=urn%3Ali%3Afsd_profile%3AABC123",
				),
				expect.any(Object),
			);
			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining(
					`/identity/dash/profiles/urn%3Ali%3Afsd_profile%3AABC123?decorationId=${PROFILE_DECORATION_ID}`,
				),
				expect.any(Object),
			);
		});
	});

	describe("human output", () => {
		it("returns formatted profile with name, headline, location", async () => {
			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: async () => PROFILE_LOOKUP_FIXTURE,
				})
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: async () => profileDashFixture,
				});

			const result = await profile(mockCredentials, "peggyrayzis");

			// Should contain the user's name
			expect(result).toContain("Peggy Rayzis");
			// Should contain the username
			expect(result).toContain("@peggyrayzis");
			// Should contain the headline
			expect(result).toContain("Developer marketing for devtools and AI founders");
			// Should contain the location
			expect(result).toContain("San Francisco Bay Area");
			// Should contain profile URL
			expect(result).toContain("linkedin.com/in/peggyrayzis");
		});
	});

	describe("JSON output", () => {
		it("returns JSON when --json flag is passed", async () => {
			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: async () => PROFILE_LOOKUP_FIXTURE,
				})
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: async () => profileDashFixture,
				});

			const result = await profile(mockCredentials, "peggyrayzis", { json: true });

			const parsed = JSON.parse(result);
			expect(parsed.firstName).toBe("Peggy");
			expect(parsed.lastName).toBe("Rayzis");
			expect(parsed.username).toBe("peggyrayzis");
			expect(parsed.headline).toBe("Developer marketing for devtools and AI founders");
			expect(parsed.location).toBe("San Francisco Bay Area");
		});
	});

	describe("error handling", () => {
		it("throws error for invalid input (empty string)", async () => {
			await expect(profile(mockCredentials, "")).rejects.toThrow(/invalid/i);
		});

		it("throws error for whitespace-only input", async () => {
			await expect(profile(mockCredentials, "   ")).rejects.toThrow(/invalid/i);
		});

		it("propagates 401 API errors", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 401,
				statusText: "Unauthorized",
				json: async () => ({}),
			});

			await expect(profile(mockCredentials, "peggyrayzis")).rejects.toThrow(/session expired/i);
		});

		it("propagates 404 API errors", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 404,
				statusText: "Not Found",
				json: async () => ({}),
			});

			await expect(profile(mockCredentials, "nonexistent-user")).rejects.toThrow(/not found/i);
		});

		it("propagates 403 API errors", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 403,
				statusText: "Forbidden",
				json: async () => ({}),
			});

			await expect(profile(mockCredentials, "restricted-user")).rejects.toThrow(/not authorized/i);
		});
	});
});
