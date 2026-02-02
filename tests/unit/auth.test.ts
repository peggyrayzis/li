import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type LinkedInCredentials, resolveCredentials } from "../../src/lib/auth.js";

describe("auth", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		vi.resetModules();
		process.env = { ...originalEnv };
		delete process.env.LINKEDIN_LI_AT;
		delete process.env.LINKEDIN_JSESSIONID;
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

				expect(result.credentials.cookieHeader).toBe('li_at=my-li-at; JSESSIONID="my-jsession"');
			});

			it("CLI flags override environment variables", async () => {
				process.env.LINKEDIN_LI_AT = "env-li-at";
				process.env.LINKEDIN_JSESSIONID = "env-jsession";

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
				process.env.LINKEDIN_JSESSIONID = "env-jsession-token";

				const result = await resolveCredentials({});

				expect(result.credentials.liAt).toBe("env-li-at-token");
				expect(result.credentials.jsessionId).toBe("env-jsession-token");
				expect(result.credentials.source).toBe("env");
			});

			it("builds correct cookie header from env vars", async () => {
				process.env.LINKEDIN_LI_AT = "env-li-at";
				process.env.LINKEDIN_JSESSIONID = "env-jsession";

				const result = await resolveCredentials({});

				expect(result.credentials.cookieHeader).toBe('li_at=env-li-at; JSESSIONID="env-jsession"');
			});

			it("strips quotes from JSESSIONID if present", async () => {
				process.env.LINKEDIN_LI_AT = "token";
				process.env.LINKEDIN_JSESSIONID = '"quoted-jsession"';

				const result = await resolveCredentials({});

				expect(result.credentials.jsessionId).toBe("quoted-jsession");
			});
		});

		describe("missing credentials", () => {
			it("throws error when no credentials found", async () => {
				await expect(resolveCredentials({})).rejects.toThrow(/LinkedIn credentials not found/);
			});

			it("throws error when only li_at is found", async () => {
				process.env.LINKEDIN_LI_AT = "only-li-at";

				await expect(resolveCredentials({})).rejects.toThrow(/LinkedIn credentials not found/);
			});

			it("throws error when only JSESSIONID is found", async () => {
				process.env.LINKEDIN_JSESSIONID = "only-jsession";

				await expect(resolveCredentials({})).rejects.toThrow(/LinkedIn credentials not found/);
			});

			it("provides actionable error message", async () => {
				try {
					await resolveCredentials({});
				} catch (error) {
					expect((error as Error).message).toContain("LINKEDIN_LI_AT");
					expect((error as Error).message).toContain("LINKEDIN_JSESSIONID");
				}
			});
		});

		describe("csrf token extraction", () => {
			it("extracts CSRF token from JSESSIONID without quotes", async () => {
				const result = await resolveCredentials({
					liAt: "token",
					jsessionId: "ajax:1234567890",
				});

				expect(result.credentials.csrfToken).toBe("ajax:1234567890");
			});

			it("strips quotes from CSRF token if JSESSIONID had them", async () => {
				const result = await resolveCredentials({
					liAt: "token",
					jsessionId: '"ajax:1234567890"',
				});

				expect(result.credentials.csrfToken).toBe("ajax:1234567890");
			});
		});

		describe("partial CLI flags", () => {
			it("falls back to env vars when only liAt flag provided", async () => {
				process.env.LINKEDIN_JSESSIONID = "env-jsession";

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
});
