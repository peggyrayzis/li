import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LinkedInCredentials } from "../../src/lib/auth.js";
import { LinkedInClient } from "../../src/lib/client.js";

// Load fixture
import meFixture from "../fixtures/me.json";
import { buildCookieHeader } from "../helpers/cookies.js";

describe("LinkedInClient", () => {
	const mockCredentials: LinkedInCredentials = {
		liAt: "AQE-test-li-at-token",
		jsessionId: "ajax:1234567890123456789",
		cookieHeader: buildCookieHeader("AQE-test-li-at-token", "ajax:1234567890123456789"),
		csrfToken: "ajax:1234567890123456789",
		source: "env",
	};

	let mockFetch: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.useFakeTimers();
		mockFetch = vi.fn();
		vi.stubGlobal("fetch", mockFetch);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	describe("constructor", () => {
		it("creates a client with valid credentials", () => {
			const client = new LinkedInClient(mockCredentials);
			expect(client).toBeInstanceOf(LinkedInClient);
		});

		it("stores credentials for use in requests", () => {
			const client = new LinkedInClient(mockCredentials);
			// Credentials should be usable - test indirectly through validateSession
			expect(client).toBeDefined();
		});
	});

	describe("validateSession", () => {
		it("returns true when GET /me returns 200", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => meFixture,
			});

			const client = new LinkedInClient(mockCredentials);
			const result = await client.validateSession();

			expect(result).toBe(true);
			expect(mockFetch).toHaveBeenCalledWith(
				"https://www.linkedin.com/voyager/api/me",
				expect.objectContaining({
					method: "GET",
					headers: expect.objectContaining({
						Cookie: mockCredentials.cookieHeader,
						"csrf-token": mockCredentials.csrfToken,
					}),
				}),
			);
		});

		it("returns false when GET /me returns 401", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 401,
				statusText: "Unauthorized",
			});

			const client = new LinkedInClient(mockCredentials);
			const result = await client.validateSession();

			expect(result).toBe(false);
		});

		it("returns false when GET /me returns 403", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 403,
				statusText: "Forbidden",
			});

			const client = new LinkedInClient(mockCredentials);
			const result = await client.validateSession();

			expect(result).toBe(false);
		});
	});

	describe("request", () => {
		it("makes GET request with correct headers", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({ data: "test" }),
			});

			const client = new LinkedInClient(mockCredentials);
			const response = await client.request("/test-endpoint");

			expect(mockFetch).toHaveBeenCalledWith(
				"https://www.linkedin.com/voyager/api/test-endpoint",
				expect.objectContaining({
					method: "GET",
					headers: expect.objectContaining({
						Cookie: mockCredentials.cookieHeader,
						"csrf-token": mockCredentials.csrfToken,
						"User-Agent": expect.stringContaining("Mozilla"),
						"X-Li-Lang": "en_US",
						"X-Restli-Protocol-Version": "2.0.0",
					}),
				}),
			);
			expect(response.ok).toBe(true);
		});

		it("makes POST request with body", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({ success: true }),
			});

			const client = new LinkedInClient(mockCredentials);
			const body = { test: "data" };
			await client.request("/test-endpoint", {
				method: "POST",
				body: JSON.stringify(body),
			});

			expect(mockFetch).toHaveBeenCalledWith(
				"https://www.linkedin.com/voyager/api/test-endpoint",
				expect.objectContaining({
					method: "POST",
					body: JSON.stringify(body),
				}),
			);
		});

		it("throws LinkedInApiError on 401 with actionable message", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 401,
				statusText: "Unauthorized",
				json: async () => ({}),
			});

			const client = new LinkedInClient(mockCredentials);

			await expect(client.request("/test-endpoint")).rejects.toThrow(/session expired/i);
		});

		it("throws LinkedInApiError on 403 with actionable message", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 403,
				statusText: "Forbidden",
				json: async () => ({}),
			});

			const client = new LinkedInClient(mockCredentials);

			await expect(client.request("/test-endpoint")).rejects.toThrow(/not authorized/i);
		});

		it("throws LinkedInApiError on 404 with actionable message", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 404,
				statusText: "Not Found",
				json: async () => ({}),
			});

			const client = new LinkedInClient(mockCredentials);

			await expect(client.request("/test-endpoint")).rejects.toThrow(/not found/i);
		});

		it("throws LinkedInApiError on 400 with details", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 400,
				statusText: "Bad Request",
				json: async () => ({ message: "Invalid parameter" }),
			});

			const client = new LinkedInClient(mockCredentials);

			await expect(client.request("/test-endpoint")).rejects.toThrow(/invalid request/i);
		});
	});

	describe("rate limiting", () => {
		it("delays between consecutive requests", async () => {
			const previousMin = process.env.LI_REQUEST_DELAY_MIN_MS;
			const previousMax = process.env.LI_REQUEST_DELAY_MAX_MS;
			process.env.LI_REQUEST_DELAY_MIN_MS = "2000";
			process.env.LI_REQUEST_DELAY_MAX_MS = "2000";

			mockFetch.mockResolvedValue({
				ok: true,
				status: 200,
				json: async () => ({}),
			});

			try {
				const client = new LinkedInClient(mockCredentials);

				// First request should go immediately
				const firstRequestPromise = client.request("/first");
				await vi.advanceTimersByTimeAsync(0);
				await firstRequestPromise;

				expect(mockFetch).toHaveBeenCalledTimes(1);

				// Second request should be delayed (2 seconds)
				const secondRequestPromise = client.request("/second");

				// After 1 second, second request should not have been made
				await vi.advanceTimersByTimeAsync(1000);
				expect(mockFetch).toHaveBeenCalledTimes(1);

				// After 2 seconds, it should go through
				await vi.advanceTimersByTimeAsync(1000);
				await secondRequestPromise;
				expect(mockFetch).toHaveBeenCalledTimes(2);
			} finally {
				if (previousMin === undefined) {
					delete process.env.LI_REQUEST_DELAY_MIN_MS;
				} else {
					process.env.LI_REQUEST_DELAY_MIN_MS = previousMin;
				}
				if (previousMax === undefined) {
					delete process.env.LI_REQUEST_DELAY_MAX_MS;
				} else {
					process.env.LI_REQUEST_DELAY_MAX_MS = previousMax;
				}
			}
		});
	});

	describe("429 retry with exponential backoff", () => {
		it("retries on 429 and eventually succeeds", async () => {
			// First call returns 429, second returns success
			mockFetch
				.mockResolvedValueOnce({
					ok: false,
					status: 429,
					statusText: "Too Many Requests",
					headers: new Map(),
					json: async () => ({}),
				})
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: async () => ({ success: true }),
				});

			const client = new LinkedInClient(mockCredentials);
			const requestPromise = client.request("/test");

			// Initial request made immediately
			await vi.advanceTimersByTimeAsync(0);
			expect(mockFetch).toHaveBeenCalledTimes(1);

			// Advance enough time for backoff (5s) + rate limit delay (up to 5s)
			await vi.advanceTimersByTimeAsync(15000);
			await requestPromise;
			expect(mockFetch).toHaveBeenCalledTimes(2);
		});

		it("throws after max 5 retries", async () => {
			// Always return 429
			mockFetch.mockResolvedValue({
				ok: false,
				status: 429,
				statusText: "Too Many Requests",
				headers: new Map(),
				json: async () => ({}),
			});

			const client = new LinkedInClient(mockCredentials);

			// Start the request but don't await it yet
			let error: Error | undefined;
			const requestPromise = client.request("/test").catch((e) => {
				error = e;
			});

			// Advance through all retries with generous time
			// Each retry: backoff (exponential) + rate limit delay (2-5s)
			await vi.advanceTimersByTimeAsync(0); // Initial
			await vi.advanceTimersByTimeAsync(15000); // Retry 1 (5s backoff + up to 5s delay)
			await vi.advanceTimersByTimeAsync(20000); // Retry 2 (10s backoff + up to 5s delay)
			await vi.advanceTimersByTimeAsync(30000); // Retry 3 (20s backoff + up to 5s delay)
			await vi.advanceTimersByTimeAsync(50000); // Retry 4 (40s backoff + up to 5s delay)
			await vi.advanceTimersByTimeAsync(90000); // Retry 5 (80s backoff + up to 5s delay)

			await requestPromise;

			expect(error).toBeDefined();
			expect(error?.message).toMatch(/rate limited/i);
			expect(mockFetch).toHaveBeenCalledTimes(6); // 1 initial + 5 retries
		});
	});

	describe("error handling", () => {
		it("handles network errors gracefully", async () => {
			mockFetch.mockRejectedValueOnce(new Error("Network error"));

			const client = new LinkedInClient(mockCredentials);

			await expect(client.request("/test")).rejects.toThrow(/network error/i);
		});

		it("handles LinkedIn block (999 status)", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 999,
				statusText: "Request Denied",
				json: async () => ({}),
			});

			const client = new LinkedInClient(mockCredentials);

			await expect(client.request("/test")).rejects.toThrow(/blocking requests/i);
		});
	});
});
