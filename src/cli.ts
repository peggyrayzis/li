#!/usr/bin/env node
/**
 * li CLI - LinkedIn from the terminal.
 * Cookie auth, Voyager API, agent-friendly.
 */

import { Command } from "commander";
import pc from "picocolors";
import { check } from "./commands/check.js";
import { connect } from "./commands/connect.js";
import { connections } from "./commands/connections.js";
import { acceptInvite, listInvites } from "./commands/invites.js";
import { listConversations, readConversation } from "./commands/messages.js";
import { profile } from "./commands/profile.js";
import { send } from "./commands/send.js";
import { whoami } from "./commands/whoami.js";
import { resolveCredentials } from "./lib/auth.js";

const program = new Command();

program
	.name("li")
	.description("LinkedIn CLI - Cookie auth, Voyager API, agent-friendly")
	.version("0.1.0")
	.option("--li-at <token>", "LinkedIn li_at cookie token")
	.option("--jsessionid <token>", "LinkedIn JSESSIONID cookie token");

/**
 * Handle errors consistently across all commands.
 */
function handleError(error: unknown): never {
	const message = error instanceof Error ? error.message : String(error);
	console.error(pc.red(`✗ ${message}`));
	process.exit(1);
}

/**
 * Get credentials from CLI options, environment, or Chrome cookies.
 * Follows Bird's pattern: CLI args > env vars > browser cookies (auto-fallback).
 */
async function getCredentials(options: { liAt?: string; jsessionid?: string }) {
	const result = await resolveCredentials({
		liAt: options.liAt,
		jsessionId: options.jsessionid,
		cookieSource: ["chrome"], // Auto-fallback to Chrome when env vars not set
	});

	// Surface warnings to user (Bird pattern)
	for (const warning of result.warnings) {
		console.error(pc.yellow(`⚠ ${warning}`));
	}

	return result.credentials;
}

// ============================================================================
// whoami - Show logged-in user info
// ============================================================================
program
	.command("whoami")
	.description("Show logged-in user info and network counts")
	.option("--json", "Output as JSON")
	.action(async (options) => {
		try {
			const globalOpts = program.opts();
			const credentials = await getCredentials(globalOpts);
			const output = await whoami(credentials, { json: options.json });
			console.log(output);
		} catch (error) {
			handleError(error);
		}
	});

// ============================================================================
// check - Validate session
// ============================================================================
program
	.command("check")
	.description("Validate session and show credential sources")
	.option("--json", "Output as JSON")
	.action(async (options) => {
		try {
			const globalOpts = program.opts();
			const credentials = await getCredentials(globalOpts);
			const output = await check(credentials, { json: options.json });
			console.log(output);
		} catch (error) {
			handleError(error);
		}
	});

// ============================================================================
// profile - View a profile
// ============================================================================
program
	.command("profile <identifier>")
	.description("View a LinkedIn profile")
	.option("--json", "Output as JSON")
	.action(async (identifier, options) => {
		try {
			const globalOpts = program.opts();
			const credentials = await getCredentials(globalOpts);
			const output = await profile(credentials, identifier, { json: options.json });
			console.log(output);
		} catch (error) {
			handleError(error);
		}
	});

// ============================================================================
// connections - List connections
// ============================================================================
program
	.command("connections")
	.description("List your LinkedIn connections")
	.option("--json", "Output as JSON")
	.option("-n, --count <number>", "Number of connections to show", "20")
	.option("--start <number>", "Start offset for pagination", "0")
	.action(async (options) => {
		try {
			const globalOpts = program.opts();
			const credentials = await getCredentials(globalOpts);
			const output = await connections(credentials, {
				json: options.json,
				count: Number.parseInt(options.count, 10),
				start: Number.parseInt(options.start, 10),
			});
			console.log(output);
		} catch (error) {
			handleError(error);
		}
	});

// ============================================================================
// connect - Send connection request
// ============================================================================
program
	.command("connect <identifier>")
	.description("Send a connection request")
	.option("--json", "Output as JSON")
	.option("--note <message>", "Personalized note (max 300 chars)")
	.action(async (identifier, options) => {
		try {
			const globalOpts = program.opts();
			const credentials = await getCredentials(globalOpts);
			const output = await connect(credentials, identifier, {
				json: options.json,
				message: options.note,
			});
			console.log(output);
		} catch (error) {
			handleError(error);
		}
	});

// ============================================================================
// invites - List and accept invitations
// ============================================================================
const invitesCmd = program.command("invites").description("Manage pending connection invitations");

invitesCmd
	.command("list", { isDefault: true })
	.description("List pending invitations")
	.option("--json", "Output as JSON")
	.action(async (options) => {
		try {
			const globalOpts = program.opts();
			const credentials = await getCredentials(globalOpts);
			const output = await listInvites(credentials, { json: options.json });
			console.log(output);
		} catch (error) {
			handleError(error);
		}
	});

invitesCmd
	.command("accept <id>")
	.description("Accept a pending invitation")
	.option("--json", "Output as JSON")
	.action(async (id, options) => {
		try {
			const globalOpts = program.opts();
			const credentials = await getCredentials(globalOpts);
			const output = await acceptInvite(credentials, id, { json: options.json });
			console.log(output);
		} catch (error) {
			handleError(error);
		}
	});

// ============================================================================
// messages - List conversations and read threads
// ============================================================================
const messagesCmd = program
	.command("messages")
	.description("List conversations and read message threads");

messagesCmd
	.command("list", { isDefault: true })
	.description("List recent conversations")
	.option("--json", "Output as JSON")
	.option("-n, --count <number>", "Number of conversations to show", "20")
	.option("--start <number>", "Start offset for pagination", "0")
	.action(async (options) => {
		try {
			const globalOpts = program.opts();
			const credentials = await getCredentials(globalOpts);
			const output = await listConversations(credentials, {
				json: options.json,
				count: Number.parseInt(options.count, 10),
				start: Number.parseInt(options.start, 10),
			});
			console.log(output);
		} catch (error) {
			handleError(error);
		}
	});

messagesCmd
	.command("read <conversationId>")
	.description("Read messages in a conversation")
	.option("--json", "Output as JSON")
	.option("-n, --count <number>", "Number of messages to show", "20")
	.option("--start <number>", "Start offset for pagination", "0")
	.action(async (conversationId, options) => {
		try {
			const globalOpts = program.opts();
			const credentials = await getCredentials(globalOpts);
			const output = await readConversation(credentials, conversationId, {
				json: options.json,
				count: Number.parseInt(options.count, 10),
				start: Number.parseInt(options.start, 10),
			});
			console.log(output);
		} catch (error) {
			handleError(error);
		}
	});

// ============================================================================
// send - Send a direct message
// ============================================================================
program
	.command("send <recipient> <message>")
	.description("Send a direct message to a connection")
	.option("--json", "Output as JSON")
	.action(async (recipient, message, options) => {
		try {
			const globalOpts = program.opts();
			const credentials = await getCredentials(globalOpts);
			const output = await send(credentials, recipient, message, { json: options.json });
			console.log(output);
		} catch (error) {
			handleError(error);
		}
	});

// Parse and execute
program.parse();
