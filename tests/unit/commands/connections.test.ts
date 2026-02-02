import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connections } from "../../../src/commands/connections.js";
import type { LinkedInCredentials } from "../../../src/lib/auth.js";

// Load fixture
import connectionsFixture from "../../fixtures/connections.json";

describe("connections command", () => {
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

	describe("successful fetch", () => {
		it("fetches connections from the correct endpoint with default pagination", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => connectionsFixture,
			});

			await connections(mockCredentials);

			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining("/relationships/dash/connections?start=0&count=20"),
				expect.any(Object),
			);
		});

		it("returns human-readable output by default", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => connectionsFixture,
			});

			const result = await connections(mockCredentials);

			// Should contain formatted connection names
			expect(result).toContain("Jane Smith");
			expect(result).toContain("@janesmith");
			expect(result).toContain("John Doe");
			expect(result).toContain("@johndoe");
			// Should contain headlines
			expect(result).toContain("Engineering Lead at Acme");
			expect(result).toContain("CTO at StartupCo");
		});

		it("returns JSON output when json option is true", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => connectionsFixture,
			});

			const result = await connections(mockCredentials, { json: true });

			// Should be valid JSON
			const parsed = JSON.parse(result);
			expect(parsed).toHaveProperty("connections");
			expect(parsed).toHaveProperty("paging");
			expect(parsed.connections).toHaveLength(2);
			expect(parsed.connections[0]).toMatchObject({
				firstName: "Jane",
				lastName: "Smith",
				username: "janesmith",
				headline: "Engineering Lead at Acme",
			});
		});

		it("includes paging information in JSON output", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => connectionsFixture,
			});

			const result = await connections(mockCredentials, { json: true });
			const parsed = JSON.parse(result);

			expect(parsed.paging).toEqual({
				total: 1203,
				count: 50,
				start: 0,
			});
		});
	});

	describe("pagination options", () => {
		it("uses custom start value", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => connectionsFixture,
			});

			await connections(mockCredentials, { start: 100 });

			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining("start=100"),
				expect.any(Object),
			);
		});

		it("uses custom count value", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => connectionsFixture,
			});

			await connections(mockCredentials, { count: 30 });

			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining("count=30"),
				expect.any(Object),
			);
		});

		it("caps count at 50 (max allowed)", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => connectionsFixture,
			});

			await connections(mockCredentials, { count: 100 });

			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining("count=50"),
				expect.any(Object),
			);
		});

		it("allows count of 50", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => connectionsFixture,
			});

			await connections(mockCredentials, { count: 50 });

			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining("count=50"),
				expect.any(Object),
			);
		});
	});

	describe("empty results", () => {
		it("handles empty connections list", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({
					elements: [],
					paging: { total: 0, count: 20, start: 0 },
				}),
			});

			const result = await connections(mockCredentials);

			expect(result).toContain("No connections found");
		});

		it("returns empty array in JSON mode for no connections", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({
					elements: [],
					paging: { total: 0, count: 20, start: 0 },
				}),
			});

			const result = await connections(mockCredentials, { json: true });
			const parsed = JSON.parse(result);

			expect(parsed.connections).toEqual([]);
			expect(parsed.paging.total).toBe(0);
		});
	});

	describe("error handling", () => {
		it("propagates API errors", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 401,
				statusText: "Unauthorized",
				json: async () => ({}),
			});

			await expect(connections(mockCredentials)).rejects.toThrow(/session expired/i);
		});

		it("propagates 403 errors", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 403,
				statusText: "Forbidden",
				json: async () => ({}),
			});

			await expect(connections(mockCredentials)).rejects.toThrow(/not authorized/i);
		});
	});
});
