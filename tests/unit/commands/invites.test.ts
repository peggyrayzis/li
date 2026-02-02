import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Import the invites command
import { acceptInvite, type InvitesOptions, listInvites } from "../../../src/commands/invites.js";
import type { LinkedInCredentials } from "../../../src/lib/auth.js";

// Load fixture
import invitationsFixture from "../../fixtures/invitations.json";

describe("invites command", () => {
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

	describe("listInvites", () => {
		it("fetches and formats pending invitations", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => invitationsFixture,
			});

			const result = await listInvites(mockCredentials);

			// Should call invitations endpoint
			expect(mockFetch).toHaveBeenCalledTimes(1);
			expect(mockFetch.mock.calls[0][0]).toContain("/relationships/invitationViews");

			// Should contain inviter names from fixture
			expect(result).toContain("Alex Johnson");
			expect(result).toContain("Sam Wilson");
		});

		it("returns human-readable output by default", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => invitationsFixture,
			});

			const result = await listInvites(mockCredentials);

			// Human output should contain formatted names and info
			expect(result).toContain("Alex Johnson");
			expect(result).toContain("newconnection"); // username
		});

		it("returns JSON when --json flag is set", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => invitationsFixture,
			});

			const options: InvitesOptions = { json: true };
			const result = await listInvites(mockCredentials, options);

			// Should be valid JSON
			const parsed = JSON.parse(result);
			expect(Array.isArray(parsed.invitations)).toBe(true);
			expect(parsed.invitations).toHaveLength(2);
			expect(parsed.invitations[0]).toHaveProperty("inviter");
		});

		it("handles empty invitations list", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({
					elements: [],
					paging: { total: 0, count: 10, start: 0 },
				}),
			});

			const result = await listInvites(mockCredentials);

			expect(result).toContain("No pending invitations");
		});

		it("includes invitation message when present", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => invitationsFixture,
			});

			const result = await listInvites(mockCredentials);

			// First invitation has a message
			expect(result).toContain("developer marketing");
		});

		it("shows shared connections count", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => invitationsFixture,
			});

			const result = await listInvites(mockCredentials);

			// Fixture has invitations with shared connections
			expect(result).toMatch(/shared connection/i);
		});
	});

	describe("acceptInvite", () => {
		it("accepts invitation by ID", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({}),
			});

			await acceptInvite(mockCredentials, "INV123");

			expect(mockFetch).toHaveBeenCalledTimes(1);

			// Should call accept endpoint with PUT method
			const [url, options] = mockFetch.mock.calls[0];
			expect(url).toContain("/relationships/invitations/INV123");
			expect(options.method).toBe("PUT");
		});

		it("sends correct action in request body", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({}),
			});

			await acceptInvite(mockCredentials, "INV123");

			const [, options] = mockFetch.mock.calls[0];
			const body = JSON.parse(options.body);
			expect(body.action).toBe("ACCEPT");
		});

		it("returns success message in human mode", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({}),
			});

			const result = await acceptInvite(mockCredentials, "INV123");

			expect(result).toMatch(/accepted/i);
		});

		it("returns JSON when --json flag is set", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({}),
			});

			const result = await acceptInvite(mockCredentials, "INV123", { json: true });

			const parsed = JSON.parse(result);
			expect(parsed).toHaveProperty("success", true);
			expect(parsed).toHaveProperty("invitationId", "INV123");
		});

		it("handles URN-format invitation ID", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({}),
			});

			await acceptInvite(mockCredentials, "urn:li:fsd_invitation:INV123");

			// Should extract just the ID part
			const [url] = mockFetch.mock.calls[0];
			expect(url).toContain("/relationships/invitations/");
			expect(url).not.toContain("urn:li:");
		});
	});

	describe("error handling", () => {
		it("throws on API error for listInvites", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 401,
				json: async () => ({}),
			});

			await expect(listInvites(mockCredentials)).rejects.toThrow(/session expired/i);
		});

		it("throws on API error for acceptInvite", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 404,
				json: async () => ({ message: "Invitation not found" }),
			});

			await expect(acceptInvite(mockCredentials, "INVALID")).rejects.toThrow(/not found/i);
		});

		it("throws when invitation ID is empty", async () => {
			await expect(acceptInvite(mockCredentials, "")).rejects.toThrow(/invalid/i);
		});
	});
});
