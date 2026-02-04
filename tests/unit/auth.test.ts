import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type LinkedInCredentials, resolveCredentials } from "../../src/lib/auth.js";
import {
	buildCookieHeader,
	JSID_COOKIE_NAME,
	LI_AT_COOKIE_NAME,
	LINKEDIN_JSID_ENV,
} from "../helpers/cookies.js";

vi.mock("@steipete/sweet-cookie", () => ({
	getCookies: vi.fn(),
}));

describe("auth", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		vi.resetModules();
		process.env = { ...originalEnv };
		delete process.env.LINKEDIN_LI_AT;
		delete process.env[LINKEDIN_JSID_ENV];
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.restoreAllMocks();
	});

	describe("resolveCredentials", () => {
		describe("from CLI flags (highest priority)", () => {
			it("resolves credentials from CLI flags", async () => {
				const result = await resolveCredentials({
					liAt: "cli-li-at-token",
					jsessionId: "cli-jsession-token",
				});

				expect(result.credentials.liAt).toBe("cli-li-at-token");
				expect(result.credentials.jsessionId).toBe("cli-jsession-token");
				expect(result.credentials.source).toBe("cli");
			});

			it("builds correct cookie header from CLI flags", async () => {
				const result = await resolveCredentials({
					liAt: "my-li-at",
					jsessionId: "my-jsession",
				});

				expect(result.credentials.cookieHeader).toBe(buildCookieHeader("my-li-at", "my-jsession"));
			});

			it("CLI flags override environment variables", async () => {
				process.env.LINKEDIN_LI_AT = "env-li-at";
				process.env[LINKEDIN_JSID_ENV] = "env-jsession";

				const result = await resolveCredentials({
					liAt: "cli-li-at",
					jsessionId: "cli-jsession",
				});

				expect(result.credentials.liAt).toBe("cli-li-at");
				expect(result.credentials.jsessionId).toBe("cli-jsession");
				expect(result.credentials.source).toBe("cli");
			});
		});

		describe("from environment variables", () => {
			it("resolves credentials from env vars when no CLI flags", async () => {
				process.env.LINKEDIN_LI_AT = "env-li-at-token";
				process.env[LINKEDIN_JSID_ENV] = "env-jsession-token";

				const result = await resolveCredentials({});

				expect(result.credentials.liAt).toBe("env-li-at-token");
				expect(result.credentials.jsessionId).toBe("env-jsession-token");
				expect(result.credentials.source).toBe("env");
			});

			it("builds correct cookie header from env vars", async () => {
				process.env.LINKEDIN_LI_AT = "env-li-at";
				process.env[LINKEDIN_JSID_ENV] = "env-jsession";

				const result = await resolveCredentials({});

				expect(result.credentials.cookieHeader).toBe(
					buildCookieHeader("env-li-at", "env-jsession"),
				);
			});

			it("strips quotes from session id if present", async () => {
				process.env.LINKEDIN_LI_AT = "token";
				process.env[LINKEDIN_JSID_ENV] = '"quoted-jsession"';

				const result = await resolveCredentials({});

				expect(result.credentials.jsessionId).toBe("quoted-jsession");
			});
		});

		describe("missing credentials", () => {
			it("throws error when no credentials found", async () => {
				await expect(resolveCredentials({})).rejects.toThrow(/LinkedIn credentials not found/);
			});

			it(`throws error when only ${LI_AT_COOKIE_NAME} is found`, async () => {
				process.env.LINKEDIN_LI_AT = "only-li-at";

				await expect(resolveCredentials({})).rejects.toThrow(/LinkedIn credentials not found/);
			});

			it("throws error when only session id is found", async () => {
				process.env[LINKEDIN_JSID_ENV] = "only-jsession";

				await expect(resolveCredentials({})).rejects.toThrow(/LinkedIn credentials not found/);
			});

			it("provides actionable error message", async () => {
				try {
					await resolveCredentials({});
				} catch (error) {
					expect((error as Error).message).toContain("LINKEDIN_LI_AT");
					expect((error as Error).message).toContain(LINKEDIN_JSID_ENV);
				}
			});
		});

		describe("csrf token extraction", () => {
			it("extracts CSRF token from session id without quotes", async () => {
				const result = await resolveCredentials({
					liAt: "token",
					jsessionId: "ajax:1234567890",
				});

				expect(result.credentials.csrfToken).toBe("ajax:1234567890");
			});

			it("strips quotes from CSRF token if session id had them", async () => {
				const result = await resolveCredentials({
					liAt: "token",
					jsessionId: '"ajax:1234567890"',
				});

				expect(result.credentials.csrfToken).toBe("ajax:1234567890");
			});
		});

		describe("partial CLI flags", () => {
			it("falls back to env vars when only liAt flag provided", async () => {
				process.env[LINKEDIN_JSID_ENV] = "env-jsession";

				const result = await resolveCredentials({
					liAt: "cli-li-at",
				});

				expect(result.credentials.liAt).toBe("cli-li-at");
				expect(result.credentials.jsessionId).toBe("env-jsession");
				expect(result.credentials.source).toBe("cli+env");
			});

			it("falls back to env vars when only jsessionId flag provided", async () => {
				process.env.LINKEDIN_LI_AT = "env-li-at";

				const result = await resolveCredentials({
					jsessionId: "cli-jsession",
				});

				expect(result.credentials.liAt).toBe("env-li-at");
				expect(result.credentials.jsessionId).toBe("cli-jsession");
				expect(result.credentials.source).toBe("cli+env");
			});
		});
	});

	describe("LinkedInCredentials type", () => {
		it("has all required fields", async () => {
			const result = await resolveCredentials({
				liAt: "token",
				jsessionId: "session",
			});

			const creds: LinkedInCredentials = result.credentials;
			expect(creds).toHaveProperty("liAt");
			expect(creds).toHaveProperty("jsessionId");
			expect(creds).toHaveProperty("cookieHeader");
			expect(creds).toHaveProperty("csrfToken");
			expect(creds).toHaveProperty("source");
		});
	});

	describe("Chrome cookie extraction", () => {
		it("resolves credentials from Chrome when cookieSource includes chrome", async () => {
			const { getCookies } = await import("@steipete/sweet-cookie");
			vi.mocked(getCookies).mockResolvedValue({
				cookies: [
					{ name: LI_AT_COOKIE_NAME, value: "chrome-li-at-token" },
					{ name: JSID_COOKIE_NAME, value: "chrome-jsession-token" },
				],
				warnings: [],
			});

			const result = await resolveCredentials({
				cookieSource: ["chrome"],
			});

			expect(result.credentials.liAt).toBe("chrome-li-at-token");
			expect(result.credentials.jsessionId).toBe("chrome-jsession-token");
			expect(result.credentials.source).toBe("chrome");
		});

		it("env vars take priority over Chrome cookies", async () => {
			const { getCookies } = await import("@steipete/sweet-cookie");
			vi.mocked(getCookies).mockResolvedValue({
				cookies: [
					{ name: LI_AT_COOKIE_NAME, value: "chrome-li-at" },
					{ name: JSID_COOKIE_NAME, value: "chrome-jsession" },
				],
				warnings: [],
			});

			process.env.LINKEDIN_LI_AT = "env-li-at";
			process.env[LINKEDIN_JSID_ENV] = "env-jsession";

			const result = await resolveCredentials({
				cookieSource: ["chrome"],
			});

			expect(result.credentials.liAt).toBe("env-li-at");
			expect(result.credentials.jsessionId).toBe("env-jsession");
			expect(result.credentials.source).toBe("env");
		});

		it("handles missing Chrome cookies gracefully", async () => {
			const { getCookies } = await import("@steipete/sweet-cookie");
			vi.mocked(getCookies).mockResolvedValue({
				cookies: [],
				warnings: [],
			});

			await expect(resolveCredentials({ cookieSource: ["chrome"] })).rejects.toThrow(
				/LinkedIn credentials not found/,
			);
		});

		it("includes browser warnings when Chrome extraction fails", async () => {
			const { getCookies } = await import("@steipete/sweet-cookie");
			vi.mocked(getCookies).mockResolvedValue({
				cookies: [],
				warnings: ["Chrome cookie DB locked"],
			});

			await expect(resolveCredentials({ cookieSource: ["chrome"] })).rejects.toMatchObject({
				warnings: ["Chrome cookie DB locked"],
			});
		});

		it("does not attempt Chrome extraction when cookieSource not specified", async () => {
			const { getCookies } = await import("@steipete/sweet-cookie");
			vi.mocked(getCookies).mockClear();

			await expect(resolveCredentials({})).rejects.toThrow(/LinkedIn credentials not found/);
			expect(getCookies).not.toHaveBeenCalled();
		});

		it("strips quotes from Chrome session id", async () => {
			const { getCookies } = await import("@steipete/sweet-cookie");
			vi.mocked(getCookies).mockResolvedValue({
				cookies: [
					{ name: LI_AT_COOKIE_NAME, value: "chrome-li-at" },
					{ name: JSID_COOKIE_NAME, value: '"quoted-jsession"' },
				],
				warnings: [],
			});

			const result = await resolveCredentials({
				cookieSource: ["chrome"],
			});

			expect(result.credentials.jsessionId).toBe("quoted-jsession");
		});
	});
});
