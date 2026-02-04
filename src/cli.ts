#!/usr/bin/env node
/**
 * li CLI - LinkedIn from the terminal.
 * Cookie auth, Voyager API, agent-friendly.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import "dotenv/config";
import { Command } from "commander";
import pc from "picocolors";
import { check } from "./commands/check.js";
import { connections } from "./commands/connections.js";
import { listInvites } from "./commands/invites.js";
import { listConversations, readConversation } from "./commands/messages.js";
import { profile } from "./commands/profile.js";
import { queryIds } from "./commands/query-ids.js";
import { whoami } from "./commands/whoami.js";
import { type BrowserSource, resolveCredentials } from "./lib/auth.js";

const CLI_VERSION = "0.1.0";
const WELCOME_FLAG_PATH = path.join(os.homedir(), ".li_welcome");
const LINKEDIN_BLUE_RGB = { r: 10, g: 102, b: 194 };
const LIGHT_GREEN_RGB = { r: 156, g: 203, b: 155 };
const WELCOME_LOGO = [
	"  ██╗     ██╗",
	"  ██║     ██║",
	"  ██║     ██║",
	"  ██║     ██║",
	"  ███████╗██║",
	"  ╚══════╝╚═╝",
].join("\n");
const COMMAND_NAMES = new Set([
	"whoami",
	"check",
	"profile",
	"connections",
	"invites",
	"messages",
	"query-ids",
	"help",
]);

const program = new Command();

program
	.name("li")
	.description("LinkedIn CLI")
	.version(CLI_VERSION)
	.option("--li-at <token>", "LinkedIn li_at cookie token")
	.option("--jsessionid <token>", "LinkedIn JSESSIONID cookie token")
	.option(
		"--cookie-source <source>",
		"Cookie source: chrome, safari, none, or comma-separated (e.g., chrome,safari).",
	)
	.option("--welcome", "Show the welcome banner");

program.configureHelp({ showGlobalOptions: true });

program.addHelpText(
	"after",
	`
Quick Start (JSON recommended for agent/script use):
  li whoami --json
  li connections -n 10 --json
  li connections --of <user> -n 10 --json
  li invites --json
`,
);

function renderWelcomeBanner(): string {
	const logo = pc.isColorSupported ? applyAnsiSolid(WELCOME_LOGO, LINKEDIN_BLUE_RGB) : WELCOME_LOGO;
	const lightGreen = (text: string) =>
		pc.isColorSupported
			? `\x1b[38;2;${LIGHT_GREEN_RGB.r};${LIGHT_GREEN_RGB.g};${LIGHT_GREEN_RGB.b}m${text}\x1b[0m`
			: text;
	const openToWork = [
		pc.gray("  "),
		lightGreen("#opentowork"),
		pc.gray("ing with us? reach out at "),
		lightGreen("li@scale.dev"),
	].join("");
	return [
		logo,
		pc.gray("  The LinkedIn CLI for Agents"),
		"",
		pc.gray("  Built by @peggyrayzis of scale.dev"),
		pc.gray("  Marketing/GTM for devtools/AI founders."),
		openToWork,
	].join("\n");
}

function renderCompactHeader(): string {
	return pc.gray(`li v${CLI_VERSION} · scale.dev`);
}

function hasSeenWelcome(): boolean {
	try {
		return fs.existsSync(WELCOME_FLAG_PATH);
	} catch {
		return false;
	}
}

function markWelcomeSeen(): void {
	try {
		fs.writeFileSync(WELCOME_FLAG_PATH, "seen\n", { flag: "wx" });
	} catch {
		// Ignore failures; welcome will show again if we can't write.
	}
}

function shouldSuppressWelcomeOutput(args: string[]): boolean {
	return args.includes("--json") || args.includes("--version") || args.includes("-V");
}

function shouldForceBanner(args: string[]): boolean {
	return args.includes("--welcome");
}

function hasCommand(args: string[]): boolean {
	return args.some((arg) => COMMAND_NAMES.has(arg));
}

type Rgb = { r: number; g: number; b: number };

function applyAnsiSolid(text: string, color: Rgb): string {
	return text
		.split("\n")
		.map((line) => {
			const match = line.match(/^(\s*)(.*)$/);
			if (!match) {
				return line;
			}
			const [, padding, content] = match;
			const colored = applyAnsiSolidLine(content, color);
			return `${padding}${colored}`;
		})
		.join("\n");
}

function applyAnsiSolidLine(text: string, color: Rgb): string {
	const { r, g, b } = color;
	return [...text]
		.map((char) => {
			if (char.trim() === "") {
				return char;
			}
			return `\x1b[38;2;${r};${g};${b}m${char}\x1b[0m`;
		})
		.join("");
}

function maybeShowWelcome(): boolean {
	const args = process.argv.slice(2);
	if (shouldSuppressWelcomeOutput(args)) {
		return false;
	}

	const forceBanner = shouldForceBanner(args);
	if (forceBanner || !hasSeenWelcome()) {
		console.log(renderWelcomeBanner());
		console.log("");
		markWelcomeSeen();
		return forceBanner && !hasCommand(args);
	}

	console.log(renderCompactHeader());
	return false;
}

/**
 * Handle errors consistently across all commands.
 */
function handleError(error: unknown): never {
	const message = error instanceof Error ? error.message : String(error);
	console.error(pc.red(`✗ ${message}`));
	process.exit(1);
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

const showHelpAfterWelcome = maybeShowWelcome();

if (showHelpAfterWelcome) {
	program.outputHelp();
	process.exit(0);
}

// Parse and execute
program.parse();
