/**
 * Connect command - Send a connection request on LinkedIn.
 *
 * Supports username, profile URL, or URN as input.
 * Optionally includes a custom message with the request.
 */

import type { LinkedInCredentials } from "../lib/auth.js";
import { LinkedInClient } from "../lib/client.js";
import endpoints from "../lib/endpoints.json" with { type: "json" };
import { resolveRecipient } from "../lib/recipient.js";
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

	// Resolve the identifier to a profile URN using the shared utility
	const resolved = await resolveRecipient(client, identifier);
	const recipientUrn = resolved.urn;
	const recipientUsername = resolved.username;

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
