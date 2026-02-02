import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LinkedInCredentials } from "../../../src/lib/auth.js";
import conversationEventsFixture from "../../fixtures/conversation-events.json";
// Load fixtures
import conversationsFixture from "../../fixtures/conversations.json";
import meFixture from "../../fixtures/me.json";
import { LinkedInApiError } from "../../../src/lib/client.js";
import { runtimeQueryIds } from "../../../src/lib/runtime-query-ids.js";

// Mock request function - hoisted for use in mock factory
const mockRequest = vi.fn();

// Mock the client module with a class, but keep LinkedInApiError
vi.mock("../../../src/lib/client.js", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../../src/lib/client.js")>();
	return {
		...actual,
		LinkedInClient: class MockLinkedInClient {
			request = mockRequest;
		},
	};
});

import { listConversations, readConversation } from "../../../src/commands/messages.js";

describe("messages command", () => {
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

	describe("listConversations", () => {
		beforeEach(() => {
			mockRequest.mockImplementation((url: string) => {
				if (url.includes("/me")) {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: () => Promise.resolve(meFixture),
					});
				}

				if (url.includes("/identity/dash/profiles")) {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: () =>
							Promise.resolve({
								elements: [
									{
										entityUrn: "urn:li:fsd_profile:ABC123",
									},
								],
							}),
					});
				}

				if (url.includes("voyagerMessagingGraphQL/graphql")) {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: () => Promise.resolve(conversationsFixture),
					});
				}

				throw new Error(`Unexpected URL: ${url}`);
			});
		});

		it("calls voyagerMessagingGraphQL conversations query", async () => {
			await listConversations(mockCredentials);

			expect(mockRequest).toHaveBeenCalledWith(
				expect.stringContaining("/voyagerMessagingGraphQL/graphql"),
				expect.any(Object),
			);
		});

		it("passes queryId and mailboxUrn variables", async () => {
			await listConversations(mockCredentials);

			expect(mockRequest).toHaveBeenCalledWith(
				expect.stringContaining("queryId=messengerConversations."),
				expect.any(Object),
			);
		});

		it("returns human-readable output by default", async () => {
			const result = await listConversations(mockCredentials);

			// Should contain participant name
			expect(result).toContain("Jane Smith");
			// Should contain username
			expect(result).toContain("@janesmith");
			// Should contain message preview (truncated at 60 chars)
			expect(result).toContain("devtools");
		});

		it("respects start and count parameters when provided", async () => {
			const result = await listConversations(mockCredentials, {
				start: 1,
				count: 1,
				json: true,
			});

			const parsed = JSON.parse(result);
			expect(parsed.conversations).toHaveLength(1);
			expect(parsed.paging.start).toBe(1);
			expect(parsed.paging.count).toBe(1);
			expect(parsed.paging.total).toBe(2);
		});

		it("indicates unread conversations", async () => {
			const result = await listConversations(mockCredentials);

			// John Doe's conversation is unread
			expect(result).toContain("unread");
		});

		it("returns JSON output when --json flag is passed", async () => {
			const result = await listConversations(mockCredentials, { json: true });

			const parsed = JSON.parse(result);
			expect(Array.isArray(parsed.conversations)).toBe(true);
			expect(parsed.conversations).toHaveLength(2);
			expect(parsed.conversations[0].participant.username).toBe("janesmith");
			expect(parsed.paging).toBeDefined();
			expect(parsed.paging.total).toBe(2);
		});

		it("includes conversation IDs in JSON output", async () => {
			const result = await listConversations(mockCredentials, { json: true });

			const parsed = JSON.parse(result);
			expect(parsed.conversations[0].conversationId).toBeDefined();
		});

		it("refreshes queryId on 400 and retries", async () => {
			const refreshSpy = vi
				.spyOn(runtimeQueryIds, "refreshFromLinkedIn")
				.mockResolvedValue({
					fetchedAt: "2025-01-01T00:00:00.000Z",
					ids: { messengerConversations: "messengerConversations.test123" },
					discovery: { harPath: "linkedIn-html" },
				});
			const getIdSpy = vi
				.spyOn(runtimeQueryIds, "getId")
				.mockResolvedValue("messengerConversations.test123");
			const snapshotSpy = vi
				.spyOn(runtimeQueryIds, "getSnapshotInfo")
				.mockResolvedValue(null);

			let graphqlCalls = 0;
			mockRequest.mockImplementation((url: string) => {
				if (url.includes("/me")) {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: () => Promise.resolve(meFixture),
					});
				}

				if (url.includes("/identity/dash/profiles")) {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: () =>
							Promise.resolve({
								elements: [
									{
										entityUrn: "urn:li:fsd_profile:ABC123",
									},
								],
							}),
					});
				}

				if (url.includes("voyagerMessagingGraphQL/graphql")) {
					graphqlCalls += 1;
					if (graphqlCalls === 1) {
						return Promise.reject(new LinkedInApiError(400, "Invalid request"));
					}
					return Promise.resolve({
						ok: true,
						status: 200,
						json: () => Promise.resolve(conversationsFixture),
					});
				}

				throw new Error(`Unexpected URL: ${url}`);
			});

			const result = await listConversations(mockCredentials);

			expect(result).toContain("Jane Smith");
			expect(refreshSpy).toHaveBeenCalledTimes(1);

			refreshSpy.mockRestore();
			getIdSpy.mockRestore();
			snapshotSpy.mockRestore();
		});
	});

	describe("readConversation", () => {
		beforeEach(() => {
			mockRequest.mockResolvedValue({
				ok: true,
				status: 200,
				json: () => Promise.resolve(conversationEventsFixture),
			});
		});

		it("calls /messaging/conversations/{id}/events endpoint", async () => {
			await readConversation(mockCredentials, "ABC123");

			expect(mockRequest).toHaveBeenCalledWith(
				expect.stringContaining("/messaging/conversations/ABC123/events"),
				expect.any(Object),
			);
		});

		it("returns human-readable output by default", async () => {
			const result = await readConversation(mockCredentials, "ABC123");

			// Should contain message content
			expect(result).toContain("devtools marketing");
			// Should contain sender usernames
			expect(result).toContain("janesmith");
			expect(result).toContain("peggyrayzis");
		});

		it("returns JSON output when --json flag is passed", async () => {
			const result = await readConversation(mockCredentials, "ABC123", { json: true });

			const parsed = JSON.parse(result);
			expect(Array.isArray(parsed.messages)).toBe(true);
			expect(parsed.messages).toHaveLength(3);
			expect(parsed.messages[0].body).toContain("devtools marketing");
			expect(parsed.messages[0].sender.username).toBe("janesmith");
		});

		it("shows messages in chronological order with newest first", async () => {
			const result = await readConversation(mockCredentials, "ABC123", { json: true });

			const parsed = JSON.parse(result);
			// Messages should be ordered with newest first (highest createdAt)
			const timestamps = parsed.messages.map((m: { createdAt: string }) =>
				new Date(m.createdAt).getTime(),
			);
			expect(timestamps[0]).toBeGreaterThan(timestamps[timestamps.length - 1]);
		});

		it("passes pagination parameters when provided", async () => {
			await readConversation(mockCredentials, "ABC123", { start: 0, count: 50 });

			expect(mockRequest).toHaveBeenCalledWith(
				expect.stringMatching(/count(?:=|%3A)50/),
				expect.any(Object),
			);
		});
	});

	describe("error handling", () => {
		it("throws when listing conversations fails", async () => {
			mockRequest.mockRejectedValueOnce(new Error("Session expired"));

			await expect(listConversations(mockCredentials)).rejects.toThrow("Session expired");
		});

		it("throws when reading conversation fails", async () => {
			mockRequest.mockRejectedValueOnce(new Error("Conversation not found"));

			await expect(readConversation(mockCredentials, "INVALID")).rejects.toThrow(
				"Conversation not found",
			);
		});
	});
});
