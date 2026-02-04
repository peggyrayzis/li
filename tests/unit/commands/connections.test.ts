import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connections } from "../../../src/commands/connections.js";
import type { LinkedInCredentials } from "../../../src/lib/auth.js";
import { resolveRecipient } from "../../../src/lib/recipient.js";
import { buildCookieHeader } from "../../helpers/cookies.js";

vi.mock("../../../src/lib/recipient.js", () => ({
	resolveRecipient: vi.fn(),
}));

function buildRscPayload(startIndex: number, count: number): string {
	const entries: string[] = [];
	for (let index = 0; index < count; index += 1) {
		const id = startIndex + index;
		entries.push(
			`{"url":"https://www.linkedin.com/in/user${id}/","children":["User ${id}"],"children":["Headline ${id}"]}`,
		);
	}
	return entries.join("");
}

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
		cookieHeader: buildCookieHeader("AQE-test-li-at-token","ajax:1234567890123456789"),
		csrfToken: "ajax:1234567890123456789",
		source: "env",
	};

	let mockFetch: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		mockFetch = vi.fn();
		vi.stubGlobal("fetch", mockFetch);
		vi.mocked(resolveRecipient).mockResolvedValue({
			username: "target",
			urn: "urn:li:fsd_profile:ACoTARGET",
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	describe("successful fetch", () => {
		it("fetches connections from the correct endpoint with default pagination", async () => {
			mockFetch
				.mockResolvedValueOnce(mockFlagshipResponse(buildRscPayload(0, 2)))
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
				.mockResolvedValueOnce(mockFlagshipResponse(buildRscPayload(0, 2)))
				.mockResolvedValue(mockFlagshipResponse(""));

			const result = await connections(mockCredentials);

			// Should contain formatted connection names
			expect(result).toContain("User 0");
			expect(result).toContain("@user0");
			expect(result).toContain("User 1");
			expect(result).toContain("@user1");
			// Should contain headlines
			expect(result).toContain("Headline 0");
			expect(result).toContain("Headline 1");
		});

		it("returns JSON output when json option is true", async () => {
			mockFetch
				.mockResolvedValueOnce(mockFlagshipResponse(buildRscPayload(0, 2)))
				.mockResolvedValue(mockFlagshipResponse(""));

			const result = await connections(mockCredentials, { json: true });

			// Should be valid JSON
			const parsed = JSON.parse(result);
			expect(parsed).toHaveProperty("connections");
			expect(parsed).toHaveProperty("paging");
			expect(parsed.connections).toHaveLength(2);
			expect(parsed.connections[0]).toMatchObject({
				firstName: "User",
				lastName: "0",
				username: "user0",
				headline: "Headline 0",
			});
		});

		it("includes paging information in JSON output", async () => {
			mockFetch
				.mockResolvedValueOnce(mockFlagshipResponse(buildRscPayload(0, 2)))
				.mockResolvedValue(mockFlagshipResponse(""));

			const result = await connections(mockCredentials, { json: true });
			const parsed = JSON.parse(result);

			expect(parsed.paging).toEqual({
				total: null,
				count: 2,
				start: 0,
			});
		});

		it("includes connectionOf filter when listing another profile's connections", async () => {
			mockFetch
				.mockResolvedValueOnce(mockFlagshipResponse(buildRscPayload(0, 2)))
				.mockResolvedValue(mockFlagshipResponse(""));

			await connections(mockCredentials, { of: "peggyrayzis" });

			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining(
					"/flagship-web/search/results/people/?origin=FACETED_SEARCH&connectionOf=%22ACoTARGET%22",
				),
				expect.objectContaining({
					body: expect.stringContaining('"filterItemSingle":"ACoTARGET"'),
				}),
			);
		});

		it("returns paging.total as null for connectionOf JSON output", async () => {
			mockFetch
				.mockResolvedValueOnce(mockFlagshipResponse(buildRscPayload(0, 2)))
				.mockResolvedValue(mockFlagshipResponse(""));

			const result = await connections(mockCredentials, { json: true, of: "peggyrayzis" });
			const parsed = JSON.parse(result);

			expect(parsed.paging.total).toBeNull();
		});
	});

	describe("pagination options", () => {
		it("uses custom start value", async () => {
			mockFetch
				.mockResolvedValueOnce(mockFlagshipResponse(buildRscPayload(100, 2)))
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
				.mockResolvedValueOnce(mockFlagshipResponse(buildRscPayload(0, 2)))
				.mockResolvedValue(mockFlagshipResponse(""));

			await connections(mockCredentials, { count: 30 });

			expect(mockFetch).toHaveBeenCalled();
		});

		it("paginates when count exceeds 50", async () => {
			mockFetch
				.mockResolvedValueOnce(mockFlagshipResponse(buildRscPayload(0, 50)))
				.mockResolvedValueOnce(mockFlagshipResponse(buildRscPayload(50, 5)))
				.mockResolvedValue(mockFlagshipResponse(""));

			await connections(mockCredentials, { count: 55 });

			expect(mockFetch).toHaveBeenCalledTimes(2);
			expect(mockFetch).toHaveBeenNthCalledWith(
				2,
				expect.any(String),
				expect.objectContaining({
					body: expect.stringContaining('"startIndex":50'),
				}),
			);
		});

		it("allows count of 50", async () => {
			mockFetch
				.mockResolvedValueOnce(mockFlagshipResponse(buildRscPayload(0, 50)))
				.mockResolvedValue(mockFlagshipResponse(""));

			await connections(mockCredentials, { count: 50 });

			expect(mockFetch).toHaveBeenCalled();
		});

		it("fetches all pages when all is true", async () => {
			mockFetch
				.mockResolvedValueOnce(mockFlagshipResponse(buildRscPayload(0, 2)))
				.mockResolvedValueOnce(mockFlagshipResponse(buildRscPayload(2, 2)))
				.mockResolvedValueOnce(mockFlagshipResponse(""));

			const result = await connections(mockCredentials, { json: true, all: true });
			const parsed = JSON.parse(result);

			expect(parsed.connections).toHaveLength(4);
			expect(parsed.paging).toEqual({
				total: null,
				count: 4,
				start: 0,
			});
			expect(mockFetch).toHaveBeenCalledTimes(3);
		});

		it("paginates connectionOf searches when count exceeds 50", async () => {
			mockFetch
				.mockResolvedValueOnce(mockFlagshipResponse(buildRscPayload(0, 10)))
				.mockResolvedValueOnce(mockFlagshipResponse(buildRscPayload(10, 10)))
				.mockResolvedValueOnce(mockFlagshipResponse(buildRscPayload(20, 10)))
				.mockResolvedValueOnce(mockFlagshipResponse(buildRscPayload(30, 10)))
				.mockResolvedValueOnce(mockFlagshipResponse(buildRscPayload(40, 10)))
				.mockResolvedValueOnce(mockFlagshipResponse(buildRscPayload(50, 10)));

			await connections(mockCredentials, { count: 55, of: "peggyrayzis" });

			expect(mockFetch).toHaveBeenCalledTimes(6);
			expect(mockFetch).toHaveBeenNthCalledWith(
				2,
				expect.any(String),
				expect.objectContaining({
					body: expect.stringContaining("SearchResultsauto-binding-2"),
				}),
			);
		});

		it("fetches all pages for connectionOf searches when all is true", async () => {
			mockFetch
				.mockResolvedValueOnce(mockFlagshipResponse(buildRscPayload(0, 10)))
				.mockResolvedValueOnce(mockFlagshipResponse(buildRscPayload(10, 10)))
				.mockResolvedValueOnce(mockFlagshipResponse(""));

			const result = await connections(mockCredentials, { json: true, all: true, of: "peggyrayzis" });
			const parsed = JSON.parse(result);

			expect(parsed.connections).toHaveLength(20);
			expect(parsed.paging).toEqual({
				total: null,
				count: 20,
				start: 0,
			});
			expect(mockFetch).toHaveBeenCalledTimes(3);
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
			expect(parsed.paging.total).toBeNull();
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
