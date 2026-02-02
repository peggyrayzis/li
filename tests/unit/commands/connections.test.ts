import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connections } from "../../../src/commands/connections.js";
import type { LinkedInCredentials } from "../../../src/lib/auth.js";

// Load fixture
const rscPayload =
	'{"url":"https://www.linkedin.com/in/janesmith/","children":["Jane Smith"],"children":["Engineering Lead at Acme"]}' +
	'{"url":"https://www.linkedin.com/in/johndoe/","children":["John Doe"],"children":["CTO at StartupCo"]}';

function mockFlagshipResponse(payload: string) {
	const encoder = new TextEncoder();
	return {
		ok: true,
		status: 200,
		headers: { get: () => null },
		arrayBuffer: async () => encoder.encode(payload).buffer,
	};
}

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
			mockFetch
				.mockResolvedValueOnce(mockFlagshipResponse(rscPayload))
				.mockResolvedValue(mockFlagshipResponse(""));

			await connections(mockCredentials);

			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining(
					"/flagship-web/rsc-action/actions/pagination?sduiid=com.linkedin.sdui.pagers.mynetwork.connectionsList",
				),
				expect.objectContaining({ method: "POST" }),
			);
		});

		it("returns human-readable output by default", async () => {
			mockFetch
				.mockResolvedValueOnce(mockFlagshipResponse(rscPayload))
				.mockResolvedValue(mockFlagshipResponse(""));

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
			mockFetch
				.mockResolvedValueOnce(mockFlagshipResponse(rscPayload))
				.mockResolvedValue(mockFlagshipResponse(""));

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
			mockFetch
				.mockResolvedValueOnce(mockFlagshipResponse(rscPayload))
				.mockResolvedValue(mockFlagshipResponse(""));

			const result = await connections(mockCredentials, { json: true });
			const parsed = JSON.parse(result);

			expect(parsed.paging).toEqual({
				total: 2,
				count: 2,
				start: 0,
			});
		});
	});

	describe("pagination options", () => {
		it("uses custom start value", async () => {
			mockFetch
				.mockResolvedValueOnce(mockFlagshipResponse(rscPayload))
				.mockResolvedValue(mockFlagshipResponse(""));

			await connections(mockCredentials, { start: 100 });

			expect(mockFetch).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					body: expect.stringContaining('"startIndex":100'),
				}),
			);
		});

		it("uses custom count value", async () => {
			mockFetch
				.mockResolvedValueOnce(mockFlagshipResponse(rscPayload))
				.mockResolvedValue(mockFlagshipResponse(""));

			await connections(mockCredentials, { count: 30 });

			expect(mockFetch).toHaveBeenCalled();
		});

		it("caps count at 50 (max allowed)", async () => {
			mockFetch
				.mockResolvedValueOnce(mockFlagshipResponse(rscPayload))
				.mockResolvedValue(mockFlagshipResponse(""));

			await connections(mockCredentials, { count: 100 });

			expect(mockFetch).toHaveBeenCalled();
		});

		it("allows count of 50", async () => {
			mockFetch
				.mockResolvedValueOnce(mockFlagshipResponse(rscPayload))
				.mockResolvedValue(mockFlagshipResponse(""));

			await connections(mockCredentials, { count: 50 });

			expect(mockFetch).toHaveBeenCalled();
		});
	});

	describe("empty results", () => {
		it("handles empty connections list", async () => {
			mockFetch.mockResolvedValueOnce(mockFlagshipResponse(""));

			const result = await connections(mockCredentials);

			expect(result).toContain("No connections found");
		});

		it("returns empty array in JSON mode for no connections", async () => {
			mockFetch.mockResolvedValueOnce(mockFlagshipResponse(""));

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
				arrayBuffer: async () => new ArrayBuffer(0),
			});

			await expect(connections(mockCredentials)).rejects.toThrow(/session expired/i);
		});

		it("propagates 403 errors", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 403,
				statusText: "Forbidden",
				json: async () => ({}),
				arrayBuffer: async () => new ArrayBuffer(0),
			});

			await expect(connections(mockCredentials)).rejects.toThrow(/not authorized/i);
		});
	});
});
