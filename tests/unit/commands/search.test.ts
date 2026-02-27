import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LinkedInCredentials } from "../../../src/lib/auth.js";
import { buildCookieHeader } from "../../helpers/cookies.js";

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

function mockApiError(status: number, statusText: string) {
	return {
		ok: false,
		status,
		statusText,
		headers: { get: () => null },
		json: async () => ({}),
		arrayBuffer: async () => new ArrayBuffer(0),
	};
}

async function loadSearchCommand(): Promise<
	(credentials: LinkedInCredentials, options: Record<string, unknown>) => Promise<string>
> {
	try {
		const module = await import("../../../src/commands/search.js");
		return module.search as (
			credentials: LinkedInCredentials,
			options: Record<string, unknown>,
		) => Promise<string>;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Missing search command module at src/commands/search.ts: ${message}`);
	}
}

describe("search command", () => {
	const mockCredentials: LinkedInCredentials = {
		liAt: "AQE-test-li-at-token",
		jsessionId: "ajax:1234567890123456789",
		cookieHeader: buildCookieHeader("AQE-test-li-at-token", "ajax:1234567890123456789"),
		csrfToken: "ajax:1234567890123456789",
		source: "env",
	};

	let mockFetch: ReturnType<typeof vi.fn>;
	let previousDelayMinMs: string | undefined;
	let previousDelayMaxMs: string | undefined;

	beforeEach(() => {
		previousDelayMinMs = process.env.LI_REQUEST_DELAY_MIN_MS;
		previousDelayMaxMs = process.env.LI_REQUEST_DELAY_MAX_MS;
		process.env.LI_REQUEST_DELAY_MIN_MS = "0";
		process.env.LI_REQUEST_DELAY_MAX_MS = "0";
		mockFetch = vi.fn();
		vi.stubGlobal("fetch", mockFetch);
	});

	afterEach(() => {
		if (previousDelayMinMs === undefined) {
			delete process.env.LI_REQUEST_DELAY_MIN_MS;
		} else {
			process.env.LI_REQUEST_DELAY_MIN_MS = previousDelayMinMs;
		}
		if (previousDelayMaxMs === undefined) {
			delete process.env.LI_REQUEST_DELAY_MAX_MS;
		} else {
			process.env.LI_REQUEST_DELAY_MAX_MS = previousDelayMaxMs;
		}
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it("applies default count when no -n is provided", async () => {
		const search = await loadSearchCommand();
		mockFetch
			.mockResolvedValueOnce(mockFlagshipResponse(buildRscPayload(0, 2)))
			.mockResolvedValue(mockFlagshipResponse(""));

		const result = await search(mockCredentials, { query: "devtools", json: true });
		const parsed = JSON.parse(result);

		expect(parsed.limitApplied).toBe(20);
		expect(parsed.query).toBe("devtools");
	});

	it("clamps high -n values to 50", async () => {
		const search = await loadSearchCommand();
		mockFetch
			.mockResolvedValueOnce(mockFlagshipResponse(buildRscPayload(0, 2)))
			.mockResolvedValue(mockFlagshipResponse(""));

		const result = await search(mockCredentials, { query: "devtools", count: 500, json: true });
		const parsed = JSON.parse(result);

		expect(parsed.limitApplied).toBe(50);
	});

	it("caps --all to 50", async () => {
		const search = await loadSearchCommand();
		mockFetch
			.mockResolvedValueOnce(mockFlagshipResponse(buildRscPayload(0, 2)))
			.mockResolvedValue(mockFlagshipResponse(""));

		const result = await search(mockCredentials, { query: "devtools", all: true, json: true });
		const parsed = JSON.parse(result);

		expect(parsed.limitApplied).toBe(50);
	});

	it("returns no-result output for empty searches", async () => {
		const search = await loadSearchCommand();
		mockFetch.mockResolvedValue(mockFlagshipResponse(""));

		const result = await search(mockCredentials, { query: "devtools" });

		expect(result).toMatch(/no .*found/i);
	});

	it("returns JSON with query, limitApplied, connections, and paging", async () => {
		const search = await loadSearchCommand();
		mockFetch
			.mockResolvedValueOnce(mockFlagshipResponse(buildRscPayload(0, 2)))
			.mockResolvedValue(mockFlagshipResponse(""));

		const result = await search(mockCredentials, { query: "founder", count: 5, json: true });
		const parsed = JSON.parse(result);

		expect(parsed.query).toBe("founder");
		expect(parsed.limitApplied).toBe(5);
		expect(parsed).toHaveProperty("connections");
		expect(parsed).toHaveProperty("paging");
		expect(Array.isArray(parsed.connections)).toBe(true);
		if (parsed.connections.length > 0) {
			expect(parsed.connections[0]).toHaveProperty("location");
		}
		expect(parsed.paging).toHaveProperty("count");
		expect(parsed.paging).toHaveProperty("start");
		expect(parsed.paging).toHaveProperty("total");
	});

	it("propagates common API failures", async () => {
		const search = await loadSearchCommand();

		mockFetch.mockResolvedValueOnce(mockApiError(401, "Unauthorized"));
		await expect(search(mockCredentials, { query: "devtools" })).rejects.toThrow(
			/session expired/i,
		);

		mockFetch.mockResolvedValueOnce(mockApiError(403, "Forbidden"));
		await expect(search(mockCredentials, { query: "devtools" })).rejects.toThrow(/not authorized/i);
	});
});
