/**
 * Connect command - Send a connection request on LinkedIn.
 *
 * Supports username, profile URL, or URN as input.
 * Optionally includes a custom message with the request.
 */

import type { LinkedInCredentials } from "../lib/auth.js";
import { LinkedInClient } from "../lib/client.js";
import endpoints from "../lib/endpoints.json" with { type: "json" };
import { parseLinkedInUrl } from "../lib/url-parser.js";
import { formatJson } from "../output/json.js";

export interface ConnectOptions {
	json?: boolean;
	message?: string;
}

export interface ConnectResult {
	success: boolean;
	recipient: string;
	recipientUrn: string;
	message?: string;
}

/**
 * Resolve a username to a profile URN using the identity/dash/profiles endpoint.
 */
async function resolveUsernameToUrn(
	client: LinkedInClient,
	username: string,
): Promise<{ urn: string; username: string }> {
	const path = endpoints.endpoints.profileByUrn.replace("{username}", username);
	const response = await client.request(path);
	const data = (await response.json()) as {
		elements?: Array<{ entityUrn?: string; publicIdentifier?: string }>;
	};

	if (!data.elements || data.elements.length === 0) {
		throw new Error(`Profile not found: ${username}`);
	}

	const profile = data.elements[0];
	return {
		urn: profile.entityUrn || "",
		username: profile.publicIdentifier || username,
	};
}

/**
 * Send a connection request to a LinkedIn user.
 *
 * @param credentials - LinkedIn session credentials
 * @param identifier - Username, profile URL, or URN of the person to connect with
 * @param options - Command options (json output, custom message)
 * @returns Formatted output string (human-readable or JSON)
 */
export async function connect(
	credentials: LinkedInCredentials,
	identifier: string,
	options: ConnectOptions = {},
): Promise<string> {
	if (!identifier || identifier.trim() === "") {
		throw new Error("Invalid input: identifier is required");
	}

	const client = new LinkedInClient(credentials);
	const parsed = parseLinkedInUrl(identifier);

	let recipientUrn: string;
	let recipientUsername: string;

	// Determine if we need to resolve the identifier
	if (parsed?.type === "profile") {
		// Check if it's already a URN
		if (parsed.identifier.startsWith("urn:li:")) {
			recipientUrn = parsed.identifier;
			// Extract a readable identifier from the URN
			recipientUsername = parsed.identifier;
		} else {
			// It's a username, resolve to URN
			const resolved = await resolveUsernameToUrn(client, parsed.identifier);
			recipientUrn = resolved.urn;
			recipientUsername = resolved.username;
		}
	} else {
		throw new Error(`Invalid input: cannot connect to ${identifier}`);
	}

	// Build the connection request payload
	// Note: The LinkedIn API auto-fills the inviter based on the authenticated session
	const payload: {
		recipientProfileUrn: string;
		message?: string;
	} = {
		recipientProfileUrn: recipientUrn,
	};

	if (options.message) {
		payload.message = options.message;
	}

	// Send the connection request
	await client.request(endpoints.endpoints.connect, {
		method: "POST",
		body: JSON.stringify(payload),
		headers: {
			"Content-Type": "application/json",
		},
	});

	const result: ConnectResult = {
		success: true,
		recipient: recipientUsername,
		recipientUrn,
	};

	if (options.message) {
		result.message = options.message;
	}

	if (options.json) {
		return formatJson(result);
	}

	// Human-readable output
	const messageInfo = options.message ? ` with message: "${options.message}"` : "";
	return `Connection request sent to ${recipientUsername}${messageInfo}`;
}
