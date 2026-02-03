import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildCookieHeader } from "../helpers/cookies.js";

// Mock all command modules
const mockWhoami = vi.fn();
const mockCheck = vi.fn();
const mockProfile = vi.fn();
const mockConnections = vi.fn();
const mockConnect = vi.fn();
const mockListInvites = vi.fn();
const mockAcceptInvite = vi.fn();
const mockListConversations = vi.fn();
const mockReadConversation = vi.fn();
const mockSend = vi.fn();
const mockResolveCredentials = vi.fn();

vi.mock("../../src/commands/whoami.js", () => ({ whoami: mockWhoami }));
vi.mock("../../src/commands/check.js", () => ({ check: mockCheck }));
vi.mock("../../src/commands/profile.js", () => ({ profile: mockProfile }));
vi.mock("../../src/commands/connections.js", () => ({ connections: mockConnections }));
vi.mock("../../src/commands/connect.js", () => ({ connect: mockConnect }));
vi.mock("../../src/commands/invites.js", () => ({
	listInvites: mockListInvites,
	acceptInvite: mockAcceptInvite,
}));
vi.mock("../../src/commands/messages.js", () => ({
	listConversations: mockListConversations,
	readConversation: mockReadConversation,
}));
vi.mock("../../src/commands/send.js", () => ({ send: mockSend }));
vi.mock("../../src/lib/auth.js", () => ({ resolveCredentials: mockResolveCredentials }));

// Mock console methods (spied to capture output and prevent test noise)
vi.spyOn(console, "log").mockImplementation(() => {});
const mockConsoleError = vi.spyOn(console, "error").mockImplementation(() => {});
const mockProcessExit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

describe("CLI", () => {
	const mockCredentials = {
		liAt: "test-token",
		jsessionId: "ajax:123",
		cookieHeader: buildCookieHeader("test-token","ajax:123"),
		csrfToken: "ajax:123",
		source: "env" as const,
	};

	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		mockResolveCredentials.mockResolvedValue({
			credentials: mockCredentials,
			warnings: [],
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("global options", () => {
		it("passes --li-at to resolveCredentials", async () => {
			mockWhoami.mockResolvedValue("test output");
			vi.resetModules();

			const originalArgv = process.argv;
			process.argv = ["node", "li", "--li-at", "custom-token", "whoami"];

			try {
				await import("../../src/cli.js");
				// Wait for async action
				await new Promise((r) => setTimeout(r, 10));
			} finally {
				process.argv = originalArgv;
			}

			expect(mockResolveCredentials).toHaveBeenCalledWith(
				expect.objectContaining({ liAt: "custom-token" }),
			);
		});

		it("passes --jsessionid to resolveCredentials", async () => {
			mockWhoami.mockResolvedValue("test output");
			vi.resetModules();

			const originalArgv = process.argv;
			process.argv = ["node", "li", "--jsessionid", "custom-session", "whoami"];

			try {
				await import("../../src/cli.js");
				await new Promise((r) => setTimeout(r, 10));
			} finally {
				process.argv = originalArgv;
			}

			expect(mockResolveCredentials).toHaveBeenCalledWith(
				expect.objectContaining({ jsessionId: "custom-session" }),
			);
		});

		it("passes --cookie-source chrome to resolveCredentials", async () => {
			mockWhoami.mockResolvedValue("test output");
			vi.resetModules();

			const originalArgv = process.argv;
			process.argv = ["node", "li", "--cookie-source", "chrome", "whoami"];

			try {
				await import("../../src/cli.js");
				await new Promise((r) => setTimeout(r, 10));
			} finally {
				process.argv = originalArgv;
			}

			expect(mockResolveCredentials).toHaveBeenCalledWith(
				expect.objectContaining({ cookieSource: ["chrome"] }),
			);
		});

		it("uses auto (chrome fallback) by default", async () => {
			mockWhoami.mockResolvedValue("test output");
			vi.resetModules();

			const originalArgv = process.argv;
			process.argv = ["node", "li", "whoami"];

			try {
				await import("../../src/cli.js");
				await new Promise((r) => setTimeout(r, 10));
			} finally {
				process.argv = originalArgv;
			}

			expect(mockResolveCredentials).toHaveBeenCalledWith(
				expect.objectContaining({ cookieSource: ["chrome", "safari"] }),
			);
		});
	});

	describe("whoami command", () => {
		it("calls whoami with credentials", async () => {
			mockWhoami.mockResolvedValue("Peggy Rayzis @peggyrayzis");
			vi.resetModules();

			const originalArgv = process.argv;
			process.argv = ["node", "li", "whoami"];

			try {
				await import("../../src/cli.js");
				await new Promise((r) => setTimeout(r, 10));
			} finally {
				process.argv = originalArgv;
			}

			expect(mockWhoami).toHaveBeenCalledWith(mockCredentials, { json: undefined });
		});

		it("passes --json flag to whoami", async () => {
			mockWhoami.mockResolvedValue('{"profile":{}}');
			vi.resetModules();

			const originalArgv = process.argv;
			process.argv = ["node", "li", "whoami", "--json"];

			try {
				await import("../../src/cli.js");
				await new Promise((r) => setTimeout(r, 10));
			} finally {
				process.argv = originalArgv;
			}

			expect(mockWhoami).toHaveBeenCalledWith(mockCredentials, { json: true });
		});
	});

	describe("check command", () => {
		it("calls check with credentials", async () => {
			mockCheck.mockResolvedValue("Session valid");
			vi.resetModules();

			const originalArgv = process.argv;
			process.argv = ["node", "li", "check"];

			try {
				await import("../../src/cli.js");
				await new Promise((r) => setTimeout(r, 10));
			} finally {
				process.argv = originalArgv;
			}

			expect(mockCheck).toHaveBeenCalledWith(mockCredentials, { json: undefined });
		});
	});

	describe("profile command", () => {
		it("calls profile with identifier", async () => {
			mockProfile.mockResolvedValue("Peggy Rayzis");
			vi.resetModules();

			const originalArgv = process.argv;
			process.argv = ["node", "li", "profile", "peggyrayzis"];

			try {
				await import("../../src/cli.js");
				await new Promise((r) => setTimeout(r, 10));
			} finally {
				process.argv = originalArgv;
			}

			expect(mockProfile).toHaveBeenCalledWith(mockCredentials, "peggyrayzis", {
				json: undefined,
			});
		});

		it("handles profile URLs", async () => {
			mockProfile.mockResolvedValue("Peggy Rayzis");
			vi.resetModules();

			const originalArgv = process.argv;
			process.argv = ["node", "li", "profile", "https://linkedin.com/in/peggyrayzis"];

			try {
				await import("../../src/cli.js");
				await new Promise((r) => setTimeout(r, 10));
			} finally {
				process.argv = originalArgv;
			}

			expect(mockProfile).toHaveBeenCalledWith(
				mockCredentials,
				"https://linkedin.com/in/peggyrayzis",
				{ json: undefined },
			);
		});
	});

	describe("connections command", () => {
		it("calls connections with default options", async () => {
			mockConnections.mockResolvedValue("Connections list");
			vi.resetModules();

			const originalArgv = process.argv;
			process.argv = ["node", "li", "connections"];

			try {
				await import("../../src/cli.js");
				await new Promise((r) => setTimeout(r, 10));
			} finally {
				process.argv = originalArgv;
			}

			expect(mockConnections).toHaveBeenCalledWith(mockCredentials, {
				json: undefined,
				count: 20,
				start: 0,
			});
		});

		it("passes pagination options", async () => {
			mockConnections.mockResolvedValue("Connections list");
			vi.resetModules();

			const originalArgv = process.argv;
			process.argv = ["node", "li", "connections", "-n", "50", "--start", "100"];

			try {
				await import("../../src/cli.js");
				await new Promise((r) => setTimeout(r, 10));
			} finally {
				process.argv = originalArgv;
			}

			expect(mockConnections).toHaveBeenCalledWith(mockCredentials, {
				json: undefined,
				count: 50,
				start: 100,
			});
		});

		it("passes --of identifier through to connections", async () => {
			mockConnections.mockResolvedValue("Connections list");
			vi.resetModules();

			const originalArgv = process.argv;
			process.argv = ["node", "li", "connections", "--of", "peggyrayzis"];

			try {
				await import("../../src/cli.js");
				await new Promise((r) => setTimeout(r, 10));
			} finally {
				process.argv = originalArgv;
			}

			expect(mockConnections).toHaveBeenCalledWith(mockCredentials, {
				json: undefined,
				count: 20,
				start: 0,
				of: "peggyrayzis",
			});
		});
	});

	describe("connect command", () => {
		it("blocks connect in v0.1", async () => {
			mockConnect.mockResolvedValue("Connection request sent");
			vi.resetModules();

			const originalArgv = process.argv;
			process.argv = ["node", "li", "connect", "johndoe"];

			try {
				await import("../../src/cli.js");
				await new Promise((r) => setTimeout(r, 10));
			} finally {
				process.argv = originalArgv;
			}

			expect(mockConnect).not.toHaveBeenCalled();
			expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining("deferred to v0.2"));
			expect(mockProcessExit).toHaveBeenCalledWith(1);
		});

		it("blocks connect with --note in v0.1", async () => {
			mockConnect.mockResolvedValue("Connection request sent");
			vi.resetModules();

			const originalArgv = process.argv;
			process.argv = ["node", "li", "connect", "johndoe", "--note", "Nice to meet you!"];

			try {
				await import("../../src/cli.js");
				await new Promise((r) => setTimeout(r, 10));
			} finally {
				process.argv = originalArgv;
			}

			expect(mockConnect).not.toHaveBeenCalled();
			expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining("deferred to v0.2"));
			expect(mockProcessExit).toHaveBeenCalledWith(1);
		});
	});

	describe("invites command", () => {
		it("lists invites by default", async () => {
			mockListInvites.mockResolvedValue("Invitations");
			vi.resetModules();

			const originalArgv = process.argv;
			process.argv = ["node", "li", "invites"];

			try {
				await import("../../src/cli.js");
				await new Promise((r) => setTimeout(r, 10));
			} finally {
				process.argv = originalArgv;
			}

			expect(mockListInvites).toHaveBeenCalledWith(mockCredentials, {
				json: undefined,
				includeSecrets: undefined,
			});
		});

		it("accepts invitation with id", async () => {
			mockAcceptInvite.mockResolvedValue("Invitation accepted");
			vi.resetModules();

			const originalArgv = process.argv;
			process.argv = ["node", "li", "invites", "accept", "INV123"];

			try {
				await import("../../src/cli.js");
				await new Promise((r) => setTimeout(r, 10));
			} finally {
				process.argv = originalArgv;
			}

			expect(mockAcceptInvite).not.toHaveBeenCalled();
			expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining("deferred to v0.2"));
			expect(mockProcessExit).toHaveBeenCalledWith(1);
		});
	});

	describe("messages command", () => {
		it("lists conversations by default", async () => {
			mockListConversations.mockResolvedValue("Conversations");
			vi.resetModules();

			const originalArgv = process.argv;
			process.argv = ["node", "li", "messages"];

			try {
				await import("../../src/cli.js");
				await new Promise((r) => setTimeout(r, 10));
			} finally {
				process.argv = originalArgv;
			}

			expect(mockListConversations).toHaveBeenCalledWith(mockCredentials, {
				json: undefined,
				count: 20,
				start: 0,
			});
		});

		it("reads conversation by id", async () => {
			mockReadConversation.mockResolvedValue("Messages");
			vi.resetModules();

			const originalArgv = process.argv;
			process.argv = ["node", "li", "messages", "read", "conv-123"];

			try {
				await import("../../src/cli.js");
				await new Promise((r) => setTimeout(r, 10));
			} finally {
				process.argv = originalArgv;
			}

			expect(mockReadConversation).toHaveBeenCalledWith(mockCredentials, "conv-123", {
				json: undefined,
				count: 20,
				start: 0,
			});
		});
	});

	describe("send command", () => {
		it("blocks send in v0.1", async () => {
			mockSend.mockResolvedValue("Message sent");
			vi.resetModules();

			const originalArgv = process.argv;
			process.argv = ["node", "li", "send", "peggyrayzis", "Hello!"];

			try {
				await import("../../src/cli.js");
				await new Promise((r) => setTimeout(r, 10));
			} finally {
				process.argv = originalArgv;
			}

			expect(mockSend).not.toHaveBeenCalled();
			expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining("deferred to v0.2"));
			expect(mockProcessExit).toHaveBeenCalledWith(1);
		});
	});

	describe("error handling", () => {
		it("displays error and exits on credential failure", async () => {
			mockResolveCredentials.mockRejectedValue(new Error("No credentials found"));
			vi.resetModules();

			const originalArgv = process.argv;
			process.argv = ["node", "li", "whoami"];

			try {
				await import("../../src/cli.js");
				await new Promise((r) => setTimeout(r, 10));
			} finally {
				process.argv = originalArgv;
			}

			expect(mockConsoleError).toHaveBeenCalledWith(
				expect.stringContaining("No credentials found"),
			);
			expect(mockProcessExit).toHaveBeenCalledWith(1);
		});

		it("displays error and exits on command failure", async () => {
			mockWhoami.mockRejectedValue(new Error("Session expired"));
			vi.resetModules();

			const originalArgv = process.argv;
			process.argv = ["node", "li", "whoami"];

			try {
				await import("../../src/cli.js");
				await new Promise((r) => setTimeout(r, 10));
			} finally {
				process.argv = originalArgv;
			}

			expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining("Session expired"));
			expect(mockProcessExit).toHaveBeenCalledWith(1);
		});

		it("displays warnings from credential resolution", async () => {
			mockResolveCredentials.mockResolvedValue({
				credentials: mockCredentials,
				warnings: ["Using Chrome cookies (env vars not set)"],
			});
			mockWhoami.mockResolvedValue("output");
			vi.resetModules();

			const originalArgv = process.argv;
			process.argv = ["node", "li", "whoami"];

			try {
				await import("../../src/cli.js");
				await new Promise((r) => setTimeout(r, 10));
			} finally {
				process.argv = originalArgv;
			}

			expect(mockConsoleError).toHaveBeenCalledWith(
				expect.stringContaining("Using Chrome cookies"),
			);
		});
	});
});
