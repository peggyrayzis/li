import { describe, expect, it, vi } from "vitest";
import {
	formatConnection,
	formatConversation,
	formatInvitation,
	formatMessage,
	formatProfile,
	formatWhoami,
} from "../../src/output/human.js";
import { formatJson } from "../../src/output/json.js";
import type {
	NetworkInfo,
	NormalizedConnection,
	NormalizedConversation,
	NormalizedInvitation,
	NormalizedMessage,
	NormalizedProfile,
} from "../../src/output/types.js";

describe("output", () => {
	describe("json.ts", () => {
		describe("formatJson", () => {
			it("returns JSON.stringify with 2-space indent", () => {
				const data = { name: "Test", value: 123 };
				const result = formatJson(data);
				expect(result).toBe(JSON.stringify(data, null, 2));
			});

			it("handles strings", () => {
				const result = formatJson("hello");
				expect(result).toBe('"hello"');
			});

			it("handles numbers", () => {
				const result = formatJson(42);
				expect(result).toBe("42");
			});

			it("handles booleans", () => {
				expect(formatJson(true)).toBe("true");
				expect(formatJson(false)).toBe("false");
			});

			it("handles null", () => {
				const result = formatJson(null);
				expect(result).toBe("null");
			});

			it("handles arrays", () => {
				const data = [1, 2, 3];
				const result = formatJson(data);
				expect(result).toBe(JSON.stringify(data, null, 2));
			});

			it("handles nested objects", () => {
				const data = {
					user: { name: "Jane", profile: { headline: "Engineer" } },
					tags: ["dev", "ai"],
				};
				const result = formatJson(data);
				expect(result).toBe(JSON.stringify(data, null, 2));
			});

			it("handles undefined by converting to empty object", () => {
				const result = formatJson(undefined);
				expect(result).toBe("{}");
			});
		});
	});

	describe("human.ts", () => {
		// Mock picocolors to make tests deterministic
		vi.mock("picocolors", () => ({
			default: {
				bold: (s: string) => `[BOLD]${s}[/BOLD]`,
				dim: (s: string) => `[DIM]${s}[/DIM]`,
				green: (s: string) => `[GREEN]${s}[/GREEN]`,
				yellow: (s: string) => `[YELLOW]${s}[/YELLOW]`,
				blue: (s: string) => `[BLUE]${s}[/BLUE]`,
				cyan: (s: string) => `[CYAN]${s}[/CYAN]`,
				red: (s: string) => `[RED]${s}[/RED]`,
				gray: (s: string) => `[GRAY]${s}[/GRAY]`,
				white: (s: string) => `[WHITE]${s}[/WHITE]`,
			},
		}));

		describe("formatProfile", () => {
			const profile: NormalizedProfile = {
				urn: "urn:li:fsd_profile:ABC123",
				username: "peggyrayzis",
				firstName: "Peggy",
				lastName: "Rayzis",
				headline: "Developer marketing for devtools and AI founders",
				location: "San Francisco, CA",
				profileUrl: "https://www.linkedin.com/in/peggyrayzis",
			};

			it("shows name with person emoji", () => {
				const result = formatProfile(profile);
				expect(result).toContain("Peggy Rayzis");
			});

			it("shows headline", () => {
				const result = formatProfile(profile);
				expect(result).toContain("Developer marketing for devtools and AI founders");
			});

			it("shows location", () => {
				const result = formatProfile(profile);
				expect(result).toContain("San Francisco, CA");
			});

			it("shows username", () => {
				const result = formatProfile(profile);
				expect(result).toContain("peggyrayzis");
			});

			it("shows profile URL", () => {
				const result = formatProfile(profile);
				expect(result).toContain("https://www.linkedin.com/in/peggyrayzis");
			});

			it("handles missing optional fields gracefully", () => {
				const minimalProfile: NormalizedProfile = {
					urn: "urn:li:fsd_profile:XYZ789",
					username: "minimal",
					firstName: "Test",
					lastName: "User",
					headline: "",
					location: "",
					profileUrl: "https://www.linkedin.com/in/minimal",
				};
				const result = formatProfile(minimalProfile);
				expect(result).toContain("Test User");
				expect(result).not.toContain("undefined");
			});
		});

		describe("formatConnection", () => {
			const connection: NormalizedConnection = {
				urn: "urn:li:fsd_profile:DEF456",
				username: "janesmith",
				firstName: "Jane",
				lastName: "Smith",
				headline: "Engineering Lead at Acme",
				profileUrl: "https://www.linkedin.com/in/janesmith",
			};

			it("shows name", () => {
				const result = formatConnection(connection);
				expect(result).toContain("Jane Smith");
			});

			it("shows headline", () => {
				const result = formatConnection(connection);
				expect(result).toContain("Engineering Lead at Acme");
			});

			it("shows username handle", () => {
				const result = formatConnection(connection);
				expect(result).toContain("@janesmith");
			});

			it("handles missing headline", () => {
				const noHeadline: NormalizedConnection = {
					...connection,
					headline: "",
				};
				const result = formatConnection(noHeadline);
				expect(result).toContain("Jane Smith");
				expect(result).not.toContain("undefined");
			});
		});

		describe("formatConversation", () => {
			const conversation: NormalizedConversation = {
				conversationId: "urn:li:fsd_conversation:123456",
				participant: {
					urn: "urn:li:fsd_profile:ABC123",
					username: "johndoe",
					firstName: "John",
					lastName: "Doe",
					headline: "Product Manager",
					profileUrl: "https://www.linkedin.com/in/johndoe",
				},
				lastMessage: "Hey, quick question about your talk...",
				lastActivityAt: new Date("2025-01-15T10:30:00Z"),
				unreadCount: 2,
				totalEventCount: 15,
			};

			it("shows participant name", () => {
				const result = formatConversation(conversation);
				expect(result).toContain("John Doe");
			});

			it("shows message preview", () => {
				const result = formatConversation(conversation);
				expect(result).toContain("Hey, quick question");
			});

			it("shows unread indicator when unread", () => {
				const result = formatConversation(conversation);
				// Should show some indicator of unread count
				expect(result).toMatch(/unread|2|\u25cf/i); // bullet, number, or "unread" text
			});

			it("does not show unread indicator when no unread messages", () => {
				const readConvo: NormalizedConversation = {
					...conversation,
					unreadCount: 0,
				};
				const result = formatConversation(readConvo);
				// Should not have special unread styling
				expect(result).not.toContain("[RED]");
			});

			it("truncates long message preview", () => {
				const longMessage: NormalizedConversation = {
					...conversation,
					lastMessage:
						"This is a very long message that should be truncated because it exceeds the maximum display length for conversation previews in the terminal output",
				};
				const result = formatConversation(longMessage);
				// Message should be truncated with ellipsis
				expect(result.length).toBeLessThan(longMessage.lastMessage.length + 100);
			});
		});

		describe("formatMessage", () => {
			const message: NormalizedMessage = {
				messageId: "urn:li:fsd_message:789",
				conversationId: "urn:li:fsd_conversation:123456",
				sender: {
					urn: "urn:li:fsd_profile:ABC123",
					username: "johndoe",
					firstName: "John",
					lastName: "Doe",
					headline: "Product Manager",
					profileUrl: "https://www.linkedin.com/in/johndoe",
				},
				body: "Thanks for connecting! I really enjoyed your talk at the conference.",
				createdAt: new Date("2025-01-15T10:30:00Z"),
			};

			it("shows sender name", () => {
				const result = formatMessage(message);
				expect(result).toContain("John Doe");
			});

			it("shows message body", () => {
				const result = formatMessage(message);
				expect(result).toContain("Thanks for connecting!");
			});

			it("shows timestamp", () => {
				const result = formatMessage(message);
				// Should contain some time indication
				expect(result).toMatch(/2025|Jan|10:30|ago/i);
			});

			it("uses message emoji", () => {
				const result = formatMessage(message);
				// Message indicator
				expect(result).toContain("\u{1F4AC}");
			});
		});

		describe("formatWhoami", () => {
			const me: NormalizedProfile = {
				urn: "urn:li:fsd_profile:ME123",
				username: "peggyrayzis",
				firstName: "Peggy",
				lastName: "Rayzis",
				headline: "Developer marketing for devtools and AI founders",
				location: "San Francisco, CA",
				profileUrl: "https://www.linkedin.com/in/peggyrayzis",
			};

			const networkInfo: NetworkInfo = {
				followersCount: 4821,
				connectionsCount: 1203,
			};

			it("shows user name", () => {
				const result = formatWhoami(me, networkInfo);
				expect(result).toContain("Peggy Rayzis");
			});

			it("shows headline", () => {
				const result = formatWhoami(me, networkInfo);
				expect(result).toContain("Developer marketing");
			});

			it("shows follower count", () => {
				const result = formatWhoami(me, networkInfo);
				expect(result).toMatch(/4[,.]?821|followers/i);
			});

			it("shows connection count", () => {
				const result = formatWhoami(me, networkInfo);
				expect(result).toMatch(/1[,.]?203|connections/i);
			});

			it("shows username", () => {
				const result = formatWhoami(me, networkInfo);
				expect(result).toContain("peggyrayzis");
			});

			it("uses person emoji", () => {
				const result = formatWhoami(me, networkInfo);
				expect(result).toContain("\u{1F464}");
			});
		});

		describe("formatInvitation", () => {
			const invitation: NormalizedInvitation = {
				invitationId: "urn:li:fsd_invitation:INV123",
				inviter: {
					urn: "urn:li:fsd_profile:SENDER456",
					username: "sarahconnor",
					firstName: "Sarah",
					lastName: "Connor",
					headline: "CTO at Cyberdyne",
					profileUrl: "https://www.linkedin.com/in/sarahconnor",
				},
				message: "Hi! I saw your post about developer marketing. Would love to connect!",
				sentAt: new Date("2025-01-14T09:00:00Z"),
				sharedConnections: 3,
			};

			it("shows inviter name", () => {
				const result = formatInvitation(invitation);
				expect(result).toContain("Sarah Connor");
			});

			it("shows inviter headline", () => {
				const result = formatInvitation(invitation);
				expect(result).toContain("CTO at Cyberdyne");
			});

			it("shows invitation message when present", () => {
				const result = formatInvitation(invitation);
				expect(result).toContain("developer marketing");
			});

			it("handles invitation without message", () => {
				const noMessage: NormalizedInvitation = {
					...invitation,
					message: undefined,
				};
				const result = formatInvitation(noMessage);
				expect(result).toContain("Sarah Connor");
				expect(result).not.toContain("undefined");
			});

			it("shows shared connections count", () => {
				const result = formatInvitation(invitation);
				expect(result).toMatch(/3|shared|mutual/i);
			});

			it("uses invite emoji", () => {
				const result = formatInvitation(invitation);
				expect(result).toContain("\u{1F4E8}");
			});
		});
	});
});
