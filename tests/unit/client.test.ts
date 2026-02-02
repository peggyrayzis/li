import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LinkedInCredentials } from "../../src/lib/auth.js";
import { LinkedInClient } from "../../src/lib/client.js";

// Load fixture
import meFixture from "../fixtures/me.json";

describe("LinkedInClient", () => {
	const mockCredentials: LinkedInCredentials = {
		liAt: "AQE-test-li-at-token",
		jsessionId: "ajax:1234567890123456789",
		cookieHeader: 'li_at=AQE-test-li-at-token; JSESSIONID="ajax:1234567890123456789"',
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
						Accept: "application/vnd.linkedin.normalized+json+2.1",
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
		it("enforces minimum 500ms between requests", async () => {
			mockFetch.mockResolvedValue({
				ok: true,
				status: 200,
				json: async () => ({}),
			});

			const client = new LinkedInClient(mockCredentials);

			// First request should go immediately
			const firstRequestPromise = client.request("/first");
			await vi.advanceTimersByTimeAsync(0);
			await firstRequestPromise;

			expect(mockFetch).toHaveBeenCalledTimes(1);

			// Second request should be delayed
			const secondRequestPromise = client.request("/second");

			// After 400ms, second request should not have been made
			await vi.advanceTimersByTimeAsync(400);
			expect(mockFetch).toHaveBeenCalledTimes(1);

			// After total 500ms, second request should go through
			await vi.advanceTimersByTimeAsync(100);
			await secondRequestPromise;
			expect(mockFetch).toHaveBeenCalledTimes(2);
		});

		it("allows immediate request if 500ms have passed since last request", async () => {
			mockFetch.mockResolvedValue({
				ok: true,
				status: 200,
				json: async () => ({}),
			});

			const client = new LinkedInClient(mockCredentials);

			// First request
			await client.request("/first");
			expect(mockFetch).toHaveBeenCalledTimes(1);

			// Wait 600ms
			await vi.advanceTimersByTimeAsync(600);

			// Second request should go immediately
			const secondRequestPromise = client.request("/second");
			await vi.advanceTimersByTimeAsync(0);
			await secondRequestPromise;

			expect(mockFetch).toHaveBeenCalledTimes(2);
		});
	});

	describe("429 retry with exponential backoff", () => {
		it("retries on 429 with exponential backoff starting at 5s", async () => {
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

			// Should wait 5s before retry
			await vi.advanceTimersByTimeAsync(4999);
			expect(mockFetch).toHaveBeenCalledTimes(1);

			await vi.advanceTimersByTimeAsync(1);
			await requestPromise;
			expect(mockFetch).toHaveBeenCalledTimes(2);
		});

		it("increases backoff exponentially on consecutive 429s", async () => {
			// Returns 429 three times, then success
			mockFetch
				.mockResolvedValueOnce({
					ok: false,
					status: 429,
					statusText: "Too Many Requests",
					headers: new Map(),
					json: async () => ({}),
				})
				.mockResolvedValueOnce({
					ok: false,
					status: 429,
					statusText: "Too Many Requests",
					headers: new Map(),
					json: async () => ({}),
				})
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

			// First request
			await vi.advanceTimersByTimeAsync(0);
			expect(mockFetch).toHaveBeenCalledTimes(1);

			// Wait 5s for first retry
			await vi.advanceTimersByTimeAsync(5000);
			expect(mockFetch).toHaveBeenCalledTimes(2);

			// Wait 10s for second retry (exponential: 5s * 2)
			await vi.advanceTimersByTimeAsync(10000);
			expect(mockFetch).toHaveBeenCalledTimes(3);

			// Wait 20s for third retry (exponential: 5s * 4)
			await vi.advanceTimersByTimeAsync(20000);
			await requestPromise;
			expect(mockFetch).toHaveBeenCalledTimes(4);
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

			// Advance through all retries: 5s + 10s + 20s + 40s + 80s = 155s
			// Plus initial request time
			await vi.advanceTimersByTimeAsync(0); // Initial
			await vi.advanceTimersByTimeAsync(5000); // Retry 1
			await vi.advanceTimersByTimeAsync(10000); // Retry 2
			await vi.advanceTimersByTimeAsync(20000); // Retry 3
			await vi.advanceTimersByTimeAsync(40000); // Retry 4
			await vi.advanceTimersByTimeAsync(80000); // Retry 5

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
