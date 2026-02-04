import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LinkedInCredentials } from "../../../src/lib/auth.js";

// Mock request function - hoisted for use in mock factory
const mockRequest = vi.fn();

// Mock the client module with a class
vi.mock("../../../src/lib/client.js", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../../src/lib/client.js")>();
	return {
		...actual,
		LinkedInClient: class MockLinkedInClient {
			request = mockRequest;
		},
	};
});

import { send } from "../../../src/commands/send.js";
import { buildCookieHeader } from "../../helpers/cookies.js";

describe("send command", () => {
	const mockCredentials: LinkedInCredentials = {
		liAt: "AQE-test-li-at-token",
		jsessionId: "ajax:1234567890123456789",
		cookieHeader: buildCookieHeader("AQE-test-li-at-token","ajax:1234567890123456789"),
		csrfToken: "ajax:1234567890123456789",
		source: "env",
	};

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("sending to existing conversation", () => {
		beforeEach(() => {
			// Mock profile resolution
			mockRequest.mockImplementation((path: string, options?: { method?: string }) => {
				// Profile lookup
				if (path.includes("/identity/dash/profiles")) {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: () =>
							Promise.resolve({
								elements: [
									{
										entityUrn: "urn:li:fsd_profile:ABC123",
										publicIdentifier: "janesmith",
										firstName: "Jane",
										lastName: "Smith",
									},
								],
							}),
					});
				}
				// Check for existing conversation
				if (path.includes("/messaging/conversations") && path.includes("recipients=")) {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: () =>
							Promise.resolve({
								elements: [
									{
										entityUrn: "urn:li:msg_conversation:CONV123",
										dashEntityUrn: "urn:li:fsd_conversation:2-CONV123",
									},
								],
							}),
					});
				}
				// Send message to existing conversation
				if (
					path.includes("/messaging/conversations/") &&
					path.includes("/events") &&
					options?.method === "POST"
				) {
					return Promise.resolve({
						ok: true,
						status: 201,
						json: () =>
							Promise.resolve({
								value: {
									entityUrn: "urn:li:fsd_message:MSG001",
									createdAt: Date.now(),
								},
							}),
					});
				}
				return Promise.reject(new Error(`Unexpected path: ${path}`));
			});
		});

		it("resolves username to profile URN", async () => {
			await send(mockCredentials, "janesmith", "Hello!");

			expect(mockRequest).toHaveBeenCalledWith(
				expect.stringContaining("/identity/dash/profiles"),
				expect.any(Object),
			);
		});

		it("checks for existing conversation with recipient", async () => {
			await send(mockCredentials, "janesmith", "Hello!");

			expect(mockRequest).toHaveBeenCalledWith(
				expect.stringMatching(/\/messaging\/conversations.*recipients=/),
				expect.any(Object),
			);
		});

		it("sends message to existing conversation", async () => {
			await send(mockCredentials, "janesmith", "Hello!");

			expect(mockRequest).toHaveBeenCalledWith(
				expect.stringContaining("/messaging/conversations/CONV123/events"),
				expect.objectContaining({
					method: "POST",
				}),
			);
		});

		it("returns human-readable success message by default", async () => {
			const result = await send(mockCredentials, "janesmith", "Hello!");

			expect(result).toContain("sent");
			expect(result).toContain("janesmith");
		});

		it("returns JSON output when --json flag is passed", async () => {
			const result = await send(mockCredentials, "janesmith", "Hello!", { json: true });

			const parsed = JSON.parse(result);
			expect(parsed.success).toBe(true);
			expect(parsed.recipient).toBeDefined();
			expect(parsed.conversationId).toBeDefined();
		});

		it("accepts LinkedIn profile URL as recipient", async () => {
			await send(mockCredentials, "https://www.linkedin.com/in/janesmith", "Hello!");

			expect(mockRequest).toHaveBeenCalledWith(
				expect.stringContaining("memberIdentity=janesmith"),
				expect.any(Object),
			);
		});

		it("accepts profile URN as recipient", async () => {
			await send(mockCredentials, "urn:li:fsd_profile:ABC123", "Hello!");

			expect(mockRequest).toHaveBeenCalled();
		});
	});

	describe("sending to new conversation", () => {
		beforeEach(() => {
			mockRequest.mockImplementation((path: string, options?: { method?: string }) => {
				// Profile lookup
				if (path.includes("/identity/dash/profiles")) {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: () =>
							Promise.resolve({
								elements: [
									{
										entityUrn: "urn:li:fsd_profile:ABC123",
										publicIdentifier: "janesmith",
									},
								],
							}),
					});
				}
				// Check for existing conversation - returns empty (no existing conversation)
				if (path.includes("/messaging/conversations") && path.includes("recipients=")) {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: () => Promise.resolve({ elements: [] }),
					});
				}
				// Create new conversation
				if (path === "/messaging/conversations" && options?.method === "POST") {
					return Promise.resolve({
						ok: true,
						status: 201,
						json: () =>
							Promise.resolve({
								value: {
									entityUrn: "urn:li:msg_conversation:NEWCONV",
									dashEntityUrn: "urn:li:fsd_conversation:2-NEWCONV",
								},
							}),
					});
				}
				return Promise.reject(new Error(`Unexpected path: ${path}`));
			});
		});

		it("creates new conversation when none exists", async () => {
			await send(mockCredentials, "janesmith", "Hello!");

			// Should have called POST /messaging/conversations (not /events)
			expect(mockRequest).toHaveBeenCalledWith(
				"/messaging/conversations",
				expect.objectContaining({
					method: "POST",
				}),
			);
		});

		it("includes message in new conversation request", async () => {
			await send(mockCredentials, "janesmith", "Hello from CLI!");

			expect(mockRequest).toHaveBeenCalledWith(
				"/messaging/conversations",
				expect.objectContaining({
					method: "POST",
					body: expect.stringContaining("Hello from CLI!"),
				}),
			);
		});

		it("returns conversation ID in response", async () => {
			const result = await send(mockCredentials, "janesmith", "Hello!", { json: true });

			const parsed = JSON.parse(result);
			expect(parsed.conversationId).toBeDefined();
		});
	});

	describe("error handling", () => {
		it("throws when profile resolution fails", async () => {
			mockRequest.mockRejectedValueOnce(new Error("Profile not found"));

			await expect(send(mockCredentials, "unknownuser", "Hello!")).rejects.toThrow(
				"Profile not found",
			);
		});

		it("throws when message sending fails", async () => {
			mockRequest.mockImplementation((path: string) => {
				if (path.includes("/identity/dash/profiles")) {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: () =>
							Promise.resolve({
								elements: [
									{ entityUrn: "urn:li:fsd_profile:ABC123", publicIdentifier: "janesmith" },
								],
							}),
					});
				}
				if (path.includes("/messaging/conversations") && path.includes("recipients=")) {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: () =>
							Promise.resolve({
								elements: [{ entityUrn: "urn:li:msg_conversation:CONV123" }],
							}),
					});
				}
				return Promise.reject(new Error("Failed to send message"));
			});

			await expect(send(mockCredentials, "janesmith", "Hello!")).rejects.toThrow(
				"Failed to send message",
			);
		});

		it("throws when recipient cannot be resolved", async () => {
			mockRequest.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: () => Promise.resolve({ elements: [] }),
			});

			await expect(send(mockCredentials, "unknownuser", "Hello!")).rejects.toThrow();
		});
	});

	describe("message formatting", () => {
		beforeEach(() => {
			mockRequest.mockImplementation((path: string, options?: { method?: string }) => {
				if (path.includes("/identity/dash/profiles")) {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: () =>
							Promise.resolve({
								elements: [
									{ entityUrn: "urn:li:fsd_profile:ABC123", publicIdentifier: "janesmith" },
								],
							}),
					});
				}
				if (path.includes("/messaging/conversations") && path.includes("recipients=")) {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: () =>
							Promise.resolve({
								elements: [{ entityUrn: "urn:li:msg_conversation:CONV123" }],
							}),
					});
				}
				if (options?.method === "POST") {
					return Promise.resolve({
						ok: true,
						status: 201,
						json: () => Promise.resolve({ value: { entityUrn: "urn:li:fsd_message:MSG001" } }),
					});
				}
				return Promise.reject(new Error(`Unexpected path: ${path}`));
			});
		});

		it("preserves message content exactly as provided", async () => {
			const message = "Hello!\n\nThis is a multiline message with special chars: @#$%";
			await send(mockCredentials, "janesmith", message);

			// The message is JSON-encoded in the body, so we need to check the parsed JSON
			const postCall = mockRequest.mock.calls.find(
				(call) => call[1]?.method === "POST" && call[0].includes("/events"),
			);
			expect(postCall).toBeDefined();
			const bodyJson = JSON.parse(postCall[1].body);
			expect(
				bodyJson.eventCreate.value["com.linkedin.voyager.messaging.create.MessageCreate"].body,
			).toBe(message);
		});
	});
});
