/**
 * Integration tests for read-only commands.
 *
 * Tests profile, connections, messages, and invites commands.
 * Skipped unless LINKEDIN_INTEGRATION_TEST=1 is set.
 *
 * These tests only perform read operations - no sending messages,
 * accepting invites, or sending connection requests.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { connections } from "../../src/commands/connections.js";
import { listInvites } from "../../src/commands/invites.js";
import { listConversations } from "../../src/commands/messages.js";
import { profile } from "../../src/commands/profile.js";
import { whoami } from "../../src/commands/whoami.js";
import type { LinkedInCredentials } from "../../src/lib/auth.js";
import { getCredentials, shouldRunIntegration } from "./setup.js";

describe.skipIf(!shouldRunIntegration)("read-only integration", () => {
	let credentials: LinkedInCredentials;
	let ownUsername: string;

	beforeAll(async () => {
		credentials = await getCredentials();

		// Get own username for profile test
		const whoamiResult = await whoami(credentials, { json: true });
		const parsed = JSON.parse(whoamiResult);
		ownUsername = parsed.profile.username;
	});

	describe("profile command", () => {
		it("fetches own profile by username", async () => {
			const result = await profile(credentials, ownUsername, { json: true });
			const parsed = JSON.parse(result);

			expect(parsed).toHaveProperty("firstName");
			expect(parsed).toHaveProperty("lastName");
			expect(parsed).toHaveProperty("username");
			expect(parsed).toHaveProperty("headline");
			expect(parsed).toHaveProperty("profileUrl");

			// Verify username matches
			expect(parsed.username).toBe(ownUsername);
		});

		it("fetches profile by URL", async () => {
			const profileUrl = `https://www.linkedin.com/in/${ownUsername}`;
			const result = await profile(credentials, profileUrl, { json: true });
			const parsed = JSON.parse(result);

			expect(parsed.username).toBe(ownUsername);
		});
	});

	describe("connections command", () => {
		it("returns connections array with paging", async () => {
			const result = await connections(credentials, { json: true, count: 5 });
			const parsed = JSON.parse(result);

			expect(parsed).toHaveProperty("connections");
			expect(parsed).toHaveProperty("paging");
			expect(Array.isArray(parsed.connections)).toBe(true);

			// Verify paging structure
			expect(parsed.paging).toHaveProperty("total");
			expect(parsed.paging).toHaveProperty("count");
			expect(parsed.paging).toHaveProperty("start");
			expect(parsed.paging.total === null || typeof parsed.paging.total === "number").toBe(true);
		});

		it("returns connection objects with expected structure", async () => {
			const result = await connections(credentials, { json: true, count: 5 });
			const parsed = JSON.parse(result);

			// Skip structure test if no connections
			if (parsed.connections.length === 0) {
				return;
			}

			const firstConnection = parsed.connections[0];
			expect(firstConnection).toHaveProperty("urn");
			expect(firstConnection).toHaveProperty("username");
			expect(firstConnection).toHaveProperty("firstName");
			expect(firstConnection).toHaveProperty("lastName");
			expect(firstConnection).toHaveProperty("headline");
			expect(firstConnection).toHaveProperty("profileUrl");
		});

		it("respects count parameter", async () => {
			const result = await connections(credentials, { json: true, count: 3 });
			const parsed = JSON.parse(result);

			// Should return at most 3 connections
			expect(parsed.connections.length).toBeLessThanOrEqual(3);
			expect(parsed.paging.count).toBeLessThanOrEqual(3);
		});

		it("supports --of identifier for connectionOf searches", async () => {
			const profileUrl = `https://www.linkedin.com/in/${ownUsername}`;
			const result = await connections(credentials, {
				json: true,
				count: 3,
				of: profileUrl,
			});
			const parsed = JSON.parse(result);

			expect(parsed).toHaveProperty("connections");
			expect(Array.isArray(parsed.connections)).toBe(true);
			expect(parsed).toHaveProperty("paging");
			expect(parsed.paging.total).toBeNull();
			expect(parsed.paging.count).toBeLessThanOrEqual(3);
			expect(parsed.paging.start).toBe(0);
		}, 15000);
	});

	describe("messages command", () => {
		it("returns conversations array with paging", async () => {
			const result = await listConversations(credentials, { json: true, count: 5 });
			const parsed = JSON.parse(result);

			expect(parsed).toHaveProperty("conversations");
			expect(parsed).toHaveProperty("paging");
			expect(Array.isArray(parsed.conversations)).toBe(true);

			// Verify paging structure
			expect(parsed.paging).toHaveProperty("total");
			expect(parsed.paging).toHaveProperty("count");
			expect(parsed.paging).toHaveProperty("start");
		});

		it("returns conversation objects with expected structure", async () => {
			const result = await listConversations(credentials, { json: true, count: 5 });
			const parsed = JSON.parse(result);

			// Skip structure test if no conversations
			if (parsed.conversations.length === 0) {
				return;
			}

			const firstConvo = parsed.conversations[0];
			expect(firstConvo).toHaveProperty("conversationId");
			expect(firstConvo).toHaveProperty("participant");
			expect(firstConvo).toHaveProperty("lastMessage");
			expect(firstConvo).toHaveProperty("lastActivityAt");
			expect(firstConvo).toHaveProperty("unreadCount");
			expect(typeof firstConvo.unreadCount).toBe("number");
		});
	});

	describe("invites command", () => {
		it("returns invitations array with total", async () => {
			const result = await listInvites(credentials, { json: true });
			const parsed = JSON.parse(result);

			expect(parsed).toHaveProperty("invitations");
			expect(parsed).toHaveProperty("total");
			expect(Array.isArray(parsed.invitations)).toBe(true);
			expect(typeof parsed.total).toBe("number");
		});

		it("returns invitation objects with expected structure (if any exist)", async () => {
			const result = await listInvites(credentials, { json: true });
			const parsed = JSON.parse(result);

			// Skip structure test if no invitations (common case)
			if (parsed.invitations.length === 0) {
				return;
			}

			const firstInvite = parsed.invitations[0];
			expect(firstInvite).toHaveProperty("inviter");
			expect(firstInvite).toHaveProperty("sentAt");
			expect(firstInvite).toHaveProperty("sharedConnections");

			// Inviter structure
			expect(firstInvite.inviter).toHaveProperty("username");
			expect(firstInvite.inviter).toHaveProperty("firstName");
			expect(firstInvite.inviter).toHaveProperty("headline");
		});
	});
});
