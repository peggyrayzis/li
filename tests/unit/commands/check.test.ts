import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LinkedInCredentials } from "../../../src/lib/auth.js";

// Mock validateSession function - hoisted for use in mock factory
const mockValidateSession = vi.fn();

// Mock the client module with a class
vi.mock("../../../src/lib/client.js", () => ({
	LinkedInClient: class MockLinkedInClient {
		validateSession = mockValidateSession;
	},
}));

import { check } from "../../../src/commands/check.js";

describe("check command", () => {
	const mockCredentials: LinkedInCredentials = {
		liAt: "AQE-test-li-at-token",
		jsessionId: "ajax:1234567890123456789",
		cookieHeader: 'li_at=AQE-test-li-at-token; JSESSIONID="ajax:1234567890123456789"',
		csrfToken: "ajax:1234567890123456789",
		source: "env",
	};

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("valid session", () => {
		beforeEach(() => {
			mockValidateSession.mockResolvedValue(true);
		});

		it("calls validateSession on the client", async () => {
			await check(mockCredentials);

			expect(mockValidateSession).toHaveBeenCalled();
		});

		it("returns human-readable output showing valid session", async () => {
			const result = await check(mockCredentials);

			expect(result).toContain("valid");
			expect(result).toContain("env");
		});

		it("returns JSON output when --json flag is passed", async () => {
			const result = await check(mockCredentials, { json: true });

			const parsed = JSON.parse(result);
			expect(parsed.valid).toBe(true);
			expect(parsed.source).toBe("env");
		});
	});

	describe("invalid session", () => {
		beforeEach(() => {
			mockValidateSession.mockResolvedValue(false);
		});

		it("returns output showing invalid session", async () => {
			const result = await check(mockCredentials);

			expect(result).toContain("invalid");
		});

		it("returns JSON with valid=false when session is invalid", async () => {
			const result = await check(mockCredentials, { json: true });

			const parsed = JSON.parse(result);
			expect(parsed.valid).toBe(false);
		});
	});

	describe("different credential sources", () => {
		it("shows cli source", async () => {
			mockValidateSession.mockResolvedValue(true);
			const cliCreds: LinkedInCredentials = {
				...mockCredentials,
				source: "cli",
			};

			const result = await check(cliCreds);

			expect(result).toContain("cli");
		});

		it("shows chrome source", async () => {
			mockValidateSession.mockResolvedValue(true);
			const chromeCreds: LinkedInCredentials = {
				...mockCredentials,
				source: "chrome",
			};

			const result = await check(chromeCreds);

			expect(result).toContain("chrome");
		});

		it("shows cli+env source", async () => {
			mockValidateSession.mockResolvedValue(true);
			const mixedCreds: LinkedInCredentials = {
				...mockCredentials,
				source: "cli+env",
			};

			const result = await check(mixedCreds);

			expect(result).toContain("cli+env");
		});
	});
});
