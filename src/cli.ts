#!/usr/bin/env node
/**
 * li CLI - LinkedIn from the terminal.
 * Cookie auth, Voyager API, agent-friendly.
 */

import "dotenv/config";
import { Command } from "commander";
import pc from "picocolors";
import { check } from "./commands/check.js";
import { connect } from "./commands/connect.js";
import { connections } from "./commands/connections.js";
import { acceptInvite, listInvites } from "./commands/invites.js";
import { listConversations, readConversation } from "./commands/messages.js";
import { profile } from "./commands/profile.js";
import { queryIds } from "./commands/query-ids.js";
import { send } from "./commands/send.js";
import { whoami } from "./commands/whoami.js";
import { type BrowserSource, resolveCredentials } from "./lib/auth.js";

const program = new Command();

program
	.name("li")
	.description("LinkedIn CLI - Cookie auth, Voyager API, agent-friendly")
	.version("0.1.0")
	.option("--li-at <token>", "LinkedIn li_at cookie token")
	.option("--jsessionid <token>", "LinkedIn JSESSIONID cookie token")
	.option(
		"--cookie-source <source>",
		"Cookie source: chrome, safari, none, or comma-separated (e.g., chrome,safari). Default: auto",
		"auto",
	);

/**
 * Handle errors consistently across all commands.
 */
function handleError(error: unknown): never {
	const message = error instanceof Error ? error.message : String(error);
	console.error(pc.red(`✗ ${message}`));
	process.exit(1);
}

function assertReadOnly(commandName: string): void {
	throw new Error(
		`"${commandName}" is a write command and is deferred to v0.2. v0.1 is read-only.`,
	);
}

/**
 * Parse cookie source option into array of browser sources.
 */
function parseCookieSource(source?: string): BrowserSource[] | undefined {
	if (!source || source === "none") {
		return undefined;
	}
	if (source === "auto") {
		// Default: try Chrome and Safari
		return ["chrome", "safari"];
	}
	// Parse comma-separated list
	const browsers = source.split(",").map((s) => s.trim().toLowerCase());
	const valid: BrowserSource[] = [];
	for (const b of browsers) {
		if (b === "chrome" || b === "safari") {
			valid.push(b);
		}
	}
	return valid.length > 0 ? valid : undefined;
}

/**
 * Get credentials from CLI options, environment, or browser cookies.
 * Follows Bird's pattern: CLI args > env vars > browser cookies (auto-fallback).
 */
async function getCredentials(options: {
	liAt?: string;
	jsessionid?: string;
	cookieSource?: string;
}) {
	const cookieSource = parseCookieSource(options.cookieSource);

	const result = await resolveCredentials({
		liAt: options.liAt,
		jsessionId: options.jsessionid,
		cookieSource,
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
	.option("--all", "Fetch all connections")
	.option("--start <number>", "Start offset for pagination", "0")
	.option("--of <identifier>", "List connections of a specific profile")
	.option("--fast", "Faster pacing with adaptive slowdown on rate limits")
	.action(async (options) => {
		try {
			const globalOpts = program.opts();
			const credentials = await getCredentials(globalOpts);
			const output = await connections(credentials, {
				json: options.json,
				all: options.all,
				count: Number.parseInt(options.count, 10),
				start: Number.parseInt(options.start, 10),
				of: options.of,
				fast: options.fast,
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
			assertReadOnly("connect");
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
	.option("--include-secrets", "Include invitation IDs and shared secrets in JSON output (unsafe)")
	.action(async (options) => {
		try {
			const globalOpts = program.opts();
			const credentials = await getCredentials(globalOpts);
			const output = await listInvites(credentials, {
				json: options.json,
				includeSecrets: options.includeSecrets,
			});
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
			assertReadOnly("invites accept");
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
			assertReadOnly("send");
			const globalOpts = program.opts();
			const credentials = await getCredentials(globalOpts);
			const output = await send(credentials, recipient, message, { json: options.json });
			console.log(output);
		} catch (error) {
			handleError(error);
		}
	});

// ============================================================================
// query-ids - Show or refresh cached GraphQL query IDs
// ============================================================================
program
	.command("query-ids")
	.description("Show or refresh cached LinkedIn GraphQL query IDs")
	.option("--json", "Output as JSON")
	.option("--refresh", "Refresh query IDs", false)
	.option("--auto", "Auto-discover query IDs from LinkedIn bundles", false)
	.option("--har <path>", "HAR file path", "www.linkedin.com.fullv3.har")
	.action(async (options) => {
		try {
			const globalOpts = program.opts();
			const credentials = options.auto ? await getCredentials(globalOpts) : undefined;
			const output = await queryIds({
				json: options.json,
				refresh: options.refresh,
				har: options.har,
				auto: options.auto,
				credentials,
			});
			console.log(output);
		} catch (error) {
			handleError(error);
		}
	});

// Parse and execute
program.parse();
