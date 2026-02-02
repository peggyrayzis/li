import { describe, expect, it } from "vitest";
import type { LinkedInCredentials } from "../../src/lib/auth.js";
import { buildHeaders } from "../../src/lib/headers.js";

describe("headers", () => {
	const mockCredentials: LinkedInCredentials = {
		liAt: "AQE-test-li-at-token",
		jsessionId: "ajax:1234567890123456789",
		cookieHeader: 'li_at=AQE-test-li-at-token; JSESSIONID="ajax:1234567890123456789"',
		csrfToken: "ajax:1234567890123456789",
		source: "env",
	};

	describe("buildHeaders", () => {
		it("returns correct Cookie header from credentials", () => {
			const headers = buildHeaders(mockCredentials);

			expect(headers.Cookie).toBe(mockCredentials.cookieHeader);
		});

		it("returns csrf-token from credentials csrfToken", () => {
			const headers = buildHeaders(mockCredentials);

			expect(headers["csrf-token"]).toBe(mockCredentials.csrfToken);
		});

		it("includes realistic User-Agent string", () => {
			const headers = buildHeaders(mockCredentials);

			expect(headers["User-Agent"]).toContain("Mozilla/5.0");
			expect(headers["User-Agent"]).toContain("Chrome");
			expect(headers["User-Agent"]).toContain("Safari");
		});

		it("includes X-Li-Lang header", () => {
			const headers = buildHeaders(mockCredentials);

			expect(headers["X-Li-Lang"]).toBe("en_US");
		});

		it("includes X-Restli-Protocol-Version header", () => {
			const headers = buildHeaders(mockCredentials);

			expect(headers["X-Restli-Protocol-Version"]).toBe("2.0.0");
		});

		it("includes Accept-Language header", () => {
			const headers = buildHeaders(mockCredentials);

			expect(headers["Accept-Language"]).toBeDefined();
			expect(headers["Accept-Language"]).toContain("en");
		});

		it("returns all required headers", () => {
			const headers = buildHeaders(mockCredentials);

			// Minimal headers for LinkedIn API - over-specifying can trigger detection
			const requiredHeaders = [
				"Cookie",
				"csrf-token",
				"User-Agent",
				"Accept",
				"Accept-Language",
				"X-Li-Lang",
				"X-Restli-Protocol-Version",
			];

			for (const header of requiredHeaders) {
				expect(headers).toHaveProperty(header);
				expect(headers[header]).toBeTruthy();
			}
		});

		it("handles different credential values correctly", () => {
			const differentCreds: LinkedInCredentials = {
				liAt: "different-li-at",
				jsessionId: "different-jsession",
				cookieHeader: 'li_at=different-li-at; JSESSIONID="different-jsession"',
				csrfToken: "different-jsession",
				source: "cli",
			};

			const headers = buildHeaders(differentCreds);

			expect(headers.Cookie).toBe(differentCreds.cookieHeader);
			expect(headers["csrf-token"]).toBe(differentCreds.csrfToken);
		});
	});

	describe("header values", () => {
		it("User-Agent matches modern Chrome on macOS", () => {
			const headers = buildHeaders(mockCredentials);

			expect(headers["User-Agent"]).toMatch(/Macintosh.*Intel Mac OS X/);
			expect(headers["User-Agent"]).toMatch(/Chrome\/\d+/);
		});
	});
});
