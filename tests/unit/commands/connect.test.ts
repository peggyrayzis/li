import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ConnectOptions, connect } from "../../../src/commands/connect.js";
import type { LinkedInCredentials } from "../../../src/lib/auth.js";
import { buildCookieHeader } from "../../helpers/cookies.js";

describe("connect command", () => {
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

	describe("with username input", () => {
		it("resolves username to URN and sends connection request", async () => {
			// Mock profile lookup response
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({
					elements: [
						{
							entityUrn: "urn:li:fsd_profile:ACoAABCD1234",
							publicIdentifier: "johndoe",
							firstName: "John",
							lastName: "Doe",
						},
					],
				}),
			});

			// Mock connection request response
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 201,
				json: async () => ({
					value: {
						created: true,
					},
				}),
			});

			const resultPromise = connect(mockCredentials, "johndoe");

			// Advance timers to allow rate-limited requests (2-5 second random delays)
			await vi.advanceTimersByTimeAsync(6000);

			const result = await resultPromise;

			expect(mockFetch).toHaveBeenCalledTimes(2);

			// First call: resolve username to URN
			expect(mockFetch.mock.calls[0][0]).toContain("/identity/dash/profiles");
			expect(mockFetch.mock.calls[0][0]).toContain("memberIdentity=johndoe");

			// Second call: POST connection request
			expect(mockFetch.mock.calls[1][0]).toContain("/growth/normInvitations");
			expect(mockFetch.mock.calls[1][1]).toMatchObject({
				method: "POST",
			});

			// Should return success message
			expect(result).toContain("johndoe");
		});

		it("includes custom message when provided", async () => {
			// Mock profile lookup
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({
					elements: [
						{
							entityUrn: "urn:li:fsd_profile:ACoAABCD1234",
							publicIdentifier: "johndoe",
						},
					],
				}),
			});

			// Mock connection request
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 201,
				json: async () => ({ value: { created: true } }),
			});

			const options: ConnectOptions = {
				message: "Hi John, let's connect!",
			};

			const resultPromise = connect(mockCredentials, "johndoe", options);
			await vi.advanceTimersByTimeAsync(6000);
			await resultPromise;

			// Check the POST body includes the message
			const postCall = mockFetch.mock.calls[1];
			const body = JSON.parse(postCall[1].body);
			expect(body.message).toBe("Hi John, let's connect!");
		});
	});

	describe("with profile URL input", () => {
		it("extracts username from URL and sends request", async () => {
			// Mock profile lookup
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({
					elements: [
						{
							entityUrn: "urn:li:fsd_profile:ACoAABCD1234",
							publicIdentifier: "janedoe",
						},
					],
				}),
			});

			// Mock connection request
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 201,
				json: async () => ({ value: { created: true } }),
			});

			const resultPromise = connect(mockCredentials, "https://www.linkedin.com/in/janedoe");
			await vi.advanceTimersByTimeAsync(6000);
			await resultPromise;

			// Should resolve the username from URL
			expect(mockFetch.mock.calls[0][0]).toContain("memberIdentity=janedoe");
		});
	});

	describe("with URN input", () => {
		it("looks up profile by URN to get username", async () => {
			// Mock profile lookup by URN
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({
					elements: [
						{
							entityUrn: "urn:li:fsd_profile:ACoAABCD1234",
							publicIdentifier: "janedoe",
						},
					],
				}),
			});

			// Mock connection request
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 201,
				json: async () => ({ value: { created: true } }),
			});

			const resultPromise = connect(mockCredentials, "urn:li:fsd_profile:ACoAABCD1234");
			await vi.advanceTimersByTimeAsync(6000);
			const result = await resultPromise;

			// Should call twice: profile lookup + connection request
			expect(mockFetch).toHaveBeenCalledTimes(2);

			// First call: look up profile by URN
			expect(mockFetch.mock.calls[0][0]).toContain("/identity/dash/profiles");
			expect(mockFetch.mock.calls[0][0]).toContain(
				encodeURIComponent("urn:li:fsd_profile:ACoAABCD1234"),
			);

			// Second call: POST connection request
			expect(mockFetch.mock.calls[1][0]).toContain("/growth/normInvitations");

			// Result should show the resolved username
			expect(result).toContain("janedoe");
		});
	});

	describe("JSON output mode", () => {
		it("returns JSON when --json flag is set", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({
					elements: [
						{
							entityUrn: "urn:li:fsd_profile:ACoAABCD1234",
							publicIdentifier: "johndoe",
						},
					],
				}),
			});

			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 201,
				json: async () => ({ value: { created: true } }),
			});

			const resultPromise = connect(mockCredentials, "johndoe", { json: true });
			await vi.advanceTimersByTimeAsync(6000);
			const result = await resultPromise;

			// Should be valid JSON
			const parsed = JSON.parse(result);
			expect(parsed).toHaveProperty("success", true);
			expect(parsed).toHaveProperty("recipient");
		});
	});

	describe("error handling", () => {
		it("throws when profile not found", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({
					elements: [],
				}),
			});

			mockFetch.mockRejectedValueOnce(new Error("Not found"));

			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 404,
				text: async () => "",
			});

			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({
					miniProfile: {
						publicIdentifier: "someoneelse",
						entityUrn: "urn:li:fs_miniProfile:OTHER",
					},
				}),
			});

			const resultPromise = connect(mockCredentials, "nonexistent");
			const expectation = expect(resultPromise).rejects.toThrow(/not found/i);

			await vi.advanceTimersByTimeAsync(6000);
			await expectation;
		});

		it("throws when connection request fails", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({
					elements: [
						{
							entityUrn: "urn:li:fsd_profile:ACoAABCD1234",
							publicIdentifier: "johndoe",
						},
					],
				}),
			});

			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 400,
				json: async () => ({ message: "Already connected" }),
			});

			// Use a wrapper to ensure the rejection is properly caught
			let error: Error | undefined;
			const resultPromise = connect(mockCredentials, "johndoe").catch((e) => {
				error = e;
			});
			await vi.advanceTimersByTimeAsync(6000);
			await resultPromise;

			expect(error).toBeDefined();
		});

		it("handles invalid input gracefully", async () => {
			await expect(connect(mockCredentials, "")).rejects.toThrow(/invalid/i);
		});
	});
});
