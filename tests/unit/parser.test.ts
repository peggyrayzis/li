import { describe, expect, it } from "vitest";
import {
	extractLocalized,
	type NormalizedConnection,
	type NormalizedConversation,
	type NormalizedInvitation,
	type NormalizedMessage,
	type NormalizedProfile,
	parseConnection,
	parseConversation,
	parseInvitation,
	parseInvitationsFromFlagshipRsc,
	parseMessage,
	parseProfile,
} from "../../src/lib/parser.js";
import connectionsFixture from "../fixtures/connections.json";
import conversationsFixture from "../fixtures/conversations.json";
import invitationsFixture from "../fixtures/invitations.json";
import profileFixture from "../fixtures/profile.json";
import profileDashFixture from "../fixtures/profile-dash.json";
import profileNormalizedFixture from "../fixtures/profile-normalized.json";

describe("parser", () => {
	describe("extractLocalized", () => {
		it("extracts value from localized object with en_US", () => {
			const localized = {
				localized: { en_US: "Hello World" },
				preferredLocale: { country: "US", language: "en" },
			};

			expect(extractLocalized(localized)).toBe("Hello World");
		});

		it("extracts value from localized object with other locales", () => {
			const localized = {
				localized: { de_DE: "Hallo Welt" },
			};

			expect(extractLocalized(localized)).toBe("Hallo Welt");
		});

		it("returns empty string for undefined input", () => {
			expect(extractLocalized(undefined)).toBe("");
		});

		it("returns empty string for null input", () => {
			expect(extractLocalized(null)).toBe("");
		});

		it("returns empty string for empty localized object", () => {
			const localized = { localized: {} };
			expect(extractLocalized(localized)).toBe("");
		});

		it("handles plain string values", () => {
			expect(extractLocalized("Plain String")).toBe("Plain String");
		});

		it("prefers en_US over other locales", () => {
			const localized = {
				localized: { en_US: "English", de_DE: "German" },
			};

			expect(extractLocalized(localized)).toBe("English");
		});
	});

	describe("parseProfile", () => {
		it("parses profile with localized fields", () => {
			const result = parseProfile(profileFixture);

			expect(result.firstName).toBe("Peggy");
			expect(result.lastName).toBe("Rayzis");
			expect(result.headline).toBe("Developer marketing for devtools and AI founders");
			expect(result.username).toBe("peggyrayzis");
			expect(result.urn).toBe("urn:li:fsd_profile:ABC123");
			expect(result.location).toBe("San Francisco Bay Area");
			expect(result.profileUrl).toBe("https://www.linkedin.com/in/peggyrayzis");
		});

		it("extracts industry when present", () => {
			const result = parseProfile(profileFixture);

			expect(result.industry).toBe("Technology, Information and Internet");
		});

		it("extracts summary when present", () => {
			const result = parseProfile(profileFixture);

			expect(result.summary).toBe(
				"I help developer tools companies with positioning, messaging, and go-to-market strategy.",
			);
		});

		it("parses profile wrapped in dash response", () => {
			const result = parseProfile(profileDashFixture);

			expect(result.firstName).toBe("Peggy");
			expect(result.lastName).toBe("Rayzis");
			expect(result.headline).toBe("Developer marketing for devtools and AI founders");
			expect(result.username).toBe("peggyrayzis");
			expect(result.urn).toBe("urn:li:fsd_profile:ABC123");
		});

		it("parses normalized profile payload with included data", () => {
			const result = parseProfile(profileNormalizedFixture);

			expect(result.firstName).toBe("Peggy");
			expect(result.lastName).toBe("Rayzis");
			expect(result.headline).toBe("Developer marketing for devtools and AI founders");
			expect(result.username).toBe("peggyrayzis");
			expect(result.urn).toBe("urn:li:fsd_profile:ABC123");
		});

		it("handles missing optional fields", () => {
			const minimal = {
				firstName: { localized: { en_US: "Test" } },
				lastName: { localized: { en_US: "User" } },
				publicIdentifier: "testuser",
				entityUrn: "urn:li:fsd_profile:TEST123",
			};

			const result = parseProfile(minimal);

			expect(result.firstName).toBe("Test");
			expect(result.lastName).toBe("User");
			expect(result.headline).toBe("");
			expect(result.location).toBe("");
			expect(result.industry).toBeUndefined();
			expect(result.summary).toBeUndefined();
		});

		it("returns correct NormalizedProfile type", () => {
			const result: NormalizedProfile = parseProfile(profileFixture);

			expect(result).toHaveProperty("firstName");
			expect(result).toHaveProperty("lastName");
			expect(result).toHaveProperty("headline");
			expect(result).toHaveProperty("username");
			expect(result).toHaveProperty("urn");
			expect(result).toHaveProperty("location");
			expect(result).toHaveProperty("profileUrl");
		});
	});

	describe("parseConnection", () => {
		it("parses connection element from connections response", () => {
			const connectionElement = connectionsFixture.elements[0];
			const result = parseConnection(connectionElement);

			expect(result.firstName).toBe("Jane");
			expect(result.lastName).toBe("Smith");
			expect(result.username).toBe("janesmith");
			expect(result.headline).toBe("Engineering Lead at Acme");
			expect(result.urn).toBe("urn:li:fsd_profile:ABC123");
			expect(result.profileUrl).toBe("https://www.linkedin.com/in/janesmith");
		});

		it("parses second connection element correctly", () => {
			const connectionElement = connectionsFixture.elements[1];
			const result = parseConnection(connectionElement);

			expect(result.firstName).toBe("John");
			expect(result.lastName).toBe("Doe");
			expect(result.username).toBe("johndoe");
			expect(result.headline).toBe("CTO at StartupCo");
			expect(result.urn).toBe("urn:li:fsd_profile:DEF456");
		});

		it("handles missing headline gracefully", () => {
			const connectionElement = {
				to: "urn:li:fsd_profile:TEST",
				"to~": {
					firstName: { localized: { en_US: "No" } },
					lastName: { localized: { en_US: "Headline" } },
					publicIdentifier: "noheadline",
				},
			};

			const result = parseConnection(connectionElement);

			expect(result.headline).toBe("");
		});

		it("returns correct NormalizedConnection type", () => {
			const connectionElement = connectionsFixture.elements[0];
			const result: NormalizedConnection = parseConnection(connectionElement);

			expect(result).toHaveProperty("firstName");
			expect(result).toHaveProperty("lastName");
			expect(result).toHaveProperty("username");
			expect(result).toHaveProperty("headline");
			expect(result).toHaveProperty("urn");
			expect(result).toHaveProperty("profileUrl");
		});
	});

	describe("parseConversation", () => {
		it("parses conversation element from conversations response", () => {
			const conversationElement = conversationsFixture.elements[0];
			const result = parseConversation(conversationElement);

			expect(result.conversationId).toBe("urn:li:fsd_conversation:2-ABC123");
			expect(result.read).toBe(true);
			expect(result.unreadCount).toBe(0);
			expect(result.totalEventCount).toBe(15);
			expect(result.groupChat).toBe(false);
		});

		it("extracts participant info", () => {
			const conversationElement = conversationsFixture.elements[0];
			const result = parseConversation(conversationElement);

			expect(result.participants).toHaveLength(1);
			expect(result.participants[0].username).toBe("janesmith");
			expect(result.participants[0].firstName).toBe("Jane");
			expect(result.participants[0].lastName).toBe("Smith");
			expect(result.participants[0].headline).toBe("Engineering Lead at Acme");
		});

		it("extracts primary participant", () => {
			const conversationElement = conversationsFixture.elements[0];
			const result = parseConversation(conversationElement);

			expect(result.participant.username).toBe("janesmith");
			expect(result.participant.firstName).toBe("Jane");
		});

		it("extracts last message body as string", () => {
			const conversationElement = conversationsFixture.elements[0];
			const result = parseConversation(conversationElement);

			expect(result.lastMessage).toBe(
				"Thanks for connecting! Would love to chat about devtools marketing.",
			);
		});

		it("parses lastActivityAt as Date", () => {
			const conversationElement = conversationsFixture.elements[0];
			const result = parseConversation(conversationElement);

			expect(result.lastActivityAt).toBeInstanceOf(Date);
			expect(result.lastActivityAt.getTime()).toBe(1706745600000);
		});

		it("parses unread conversation correctly", () => {
			const conversationElement = conversationsFixture.elements[1];
			const result = parseConversation(conversationElement);

			expect(result.read).toBe(false);
			expect(result.unreadCount).toBe(1);
			expect(result.participants[0].firstName).toBe("John");
			expect(result.participants[0].lastName).toBe("Doe");
		});

		it("returns correct NormalizedConversation type", () => {
			const conversationElement = conversationsFixture.elements[0];
			const result: NormalizedConversation = parseConversation(conversationElement);

			expect(result).toHaveProperty("conversationId");
			expect(result).toHaveProperty("read");
			expect(result).toHaveProperty("unreadCount");
			expect(result).toHaveProperty("totalEventCount");
			expect(result).toHaveProperty("groupChat");
			expect(result).toHaveProperty("participants");
			expect(result).toHaveProperty("participant");
			expect(result).toHaveProperty("lastMessage");
			expect(result).toHaveProperty("lastActivityAt");
		});
	});

	describe("parseMessage", () => {
		it("parses message event from conversation events", () => {
			const messageEvent = conversationsFixture.elements[0].events[0];
			const result = parseMessage(messageEvent);

			expect(result.body).toBe(
				"Thanks for connecting! Would love to chat about devtools marketing.",
			);
			expect(result.sender.username).toBe("janesmith");
		});

		it("parses createdAt as Date", () => {
			const messageEvent = conversationsFixture.elements[0].events[0];
			const result = parseMessage(messageEvent);

			expect(result.createdAt).toBeInstanceOf(Date);
			expect(result.createdAt.getTime()).toBe(1706745600000);
		});

		it("extracts attachments array", () => {
			const messageEvent = conversationsFixture.elements[0].events[0];
			const result = parseMessage(messageEvent);

			expect(result.attachments).toEqual([]);
		});

		it("handles different message event", () => {
			const messageEvent = conversationsFixture.elements[1].events[0];
			const result = parseMessage(messageEvent);

			expect(result.body).toBe("Hey! Quick question about positioning for our dev tool launch.");
			expect(result.sender.username).toBe("johndoe");
		});

		it("accepts optional conversationId parameter", () => {
			const messageEvent = conversationsFixture.elements[0].events[0];
			const result = parseMessage(messageEvent, "test-conversation-id");

			expect(result.conversationId).toBe("test-conversation-id");
		});

		it("returns correct NormalizedMessage type", () => {
			const messageEvent = conversationsFixture.elements[0].events[0];
			const result: NormalizedMessage = parseMessage(messageEvent);

			expect(result).toHaveProperty("body");
			expect(result).toHaveProperty("sender");
			expect(result).toHaveProperty("createdAt");
			expect(result).toHaveProperty("attachments");
			expect(result).toHaveProperty("messageId");
			expect(result).toHaveProperty("conversationId");
		});
	});

	describe("parseInvitation", () => {
		it("parses invitation element from invitations response", () => {
			const invitationElement = invitationsFixture.elements[0];
			const result = parseInvitation(invitationElement);

			expect(result.urn).toBe("urn:li:fsd_invitation:INV123");
			expect(result.invitationId).toBe("INV123");
			expect(result.sharedSecret).toBe("shared123");
			expect(result.type).toBe("CONNECTION");
		});

		it("extracts inviter profile info", () => {
			const invitationElement = invitationsFixture.elements[0];
			const result = parseInvitation(invitationElement);

			expect(result.inviter.username).toBe("newconnection");
			expect(result.inviter.firstName).toBe("Alex");
			expect(result.inviter.lastName).toBe("Johnson");
			expect(result.inviter.headline).toBe("Product Manager at TechCorp");
		});

		it("extracts invitation message", () => {
			const invitationElement = invitationsFixture.elements[0];
			const result = parseInvitation(invitationElement);

			expect(result.message).toBe("Hi Peggy, I loved your talk on developer marketing!");
		});

		it("handles missing message", () => {
			const invitationElement = invitationsFixture.elements[1];
			const result = parseInvitation(invitationElement);

			expect(result.message).toBeUndefined();
		});

		it("extracts shared connections count", () => {
			const invitationElement = invitationsFixture.elements[0];
			const result = parseInvitation(invitationElement);

			expect(result.sharedConnections).toBe(5);
		});

		it("parses sentAt as Date", () => {
			const invitationElement = invitationsFixture.elements[0];
			const result = parseInvitation(invitationElement);

			expect(result.sentAt).toBeInstanceOf(Date);
			expect(result.sentAt.getTime()).toBe(1706572800000);
		});

		it("parses second invitation correctly", () => {
			const invitationElement = invitationsFixture.elements[1];
			const result = parseInvitation(invitationElement);

			expect(result.inviter.firstName).toBe("Sam");
			expect(result.inviter.lastName).toBe("Wilson");
			expect(result.sharedConnections).toBe(12);
			expect(result.message).toBeUndefined();
		});

		it("returns correct NormalizedInvitation type", () => {
			const invitationElement = invitationsFixture.elements[0];
			const result: NormalizedInvitation = parseInvitation(invitationElement);

			expect(result).toHaveProperty("urn");
			expect(result).toHaveProperty("invitationId");
			expect(result).toHaveProperty("sharedSecret");
			expect(result).toHaveProperty("type");
			expect(result).toHaveProperty("inviter");
			expect(result).toHaveProperty("sharedConnections");
			expect(result).toHaveProperty("sentAt");
		});
	});

	describe("parseInvitationsFromFlagshipRsc", () => {
		it("parses invitation data from RSC payload", () => {
			const payload =
				'{"entityUrn":"urn:li:fsd_invitation:INV123","sharedSecret":"secret-1","invitationType":"CONNECTION","sentTime":1706572800000,"sharedConnections":{"count":3},"genericInviter":{"miniProfile":{"publicIdentifier":"newconnection","firstName":"Alex","lastName":"Johnson","occupation":"Engineering Lead at Acme"}},"message":"Loved your developer marketing talk!"}' +
				'{"entityUrn":"urn:li:fsd_invitation:INV456","sharedSecret":"secret-2","invitationType":"CONNECTION","sentTime":1706486400000,"sharedConnections":{"count":1},"genericInviter":{"miniProfile":{"publicIdentifier":"anotherone","firstName":"Sam","lastName":"Wilson","occupation":"Designer at Studio"}}}';

			const result = parseInvitationsFromFlagshipRsc(payload);

			expect(result).toHaveLength(2);
			expect(result[0]).toMatchObject({
				invitationId: "INV123",
				type: "CONNECTION",
				sharedConnections: 3,
			});
			expect(result[0].inviter).toMatchObject({
				username: "newconnection",
				firstName: "Alex",
				lastName: "Johnson",
				headline: "Engineering Lead at Acme",
			});
			expect(result[0].message).toContain("developer marketing");
		});
	});
});
