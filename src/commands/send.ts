/**
 * Send command - Send a DM to a LinkedIn connection.
 *
 * Handles both new and existing conversations:
 * - If a conversation already exists with the recipient, the message is appended
 * - If no conversation exists, a new one is created
 *
 * Accepts various input formats for the recipient:
 * - Plain username: "peggyrayzis"
 * - Profile URL: "https://linkedin.com/in/peggyrayzis"
 * - Profile URN: "urn:li:fsd_profile:ABC123"
 */

import pc from "picocolors";
import type { LinkedInCredentials } from "../lib/auth.js";
import { LinkedInClient } from "../lib/client.js";
import { parseLinkedInUrl } from "../lib/url-parser.js";
import { formatJson } from "../output/json.js";

export interface SendOptions {
	json?: boolean;
}

interface ProfileLookupResponse {
	elements: Array<{
		entityUrn: string;
		publicIdentifier?: string;
		firstName?: string;
		lastName?: string;
	}>;
}

interface ConversationLookupResponse {
	elements: Array<{
		entityUrn: string;
		dashEntityUrn?: string;
	}>;
}

interface SendMessageResponse {
	value?: {
		entityUrn?: string;
		createdAt?: number;
	};
}

interface SendResult {
	success: boolean;
	recipient: {
		username: string;
		urn: string;
	};
	conversationId: string;
	messageId?: string;
	isNewConversation: boolean;
}

/**
 * Send a direct message to a LinkedIn connection.
 *
 * @param credentials - LinkedIn credentials
 * @param recipient - Username, profile URL, or URN of the recipient
 * @param message - Message body to send
 * @param options - Command options (--json flag)
 * @returns Formatted output string (human-readable or JSON)
 */
export async function send(
	credentials: LinkedInCredentials,
	recipient: string,
	message: string,
	options: SendOptions = {},
): Promise<string> {
	const client = new LinkedInClient(credentials);

	// Step 1: Resolve recipient to profile URN
	const resolvedProfile = await resolveRecipient(client, recipient);

	// Step 2: Check for existing conversation
	const existingConversation = await findExistingConversation(client, resolvedProfile.urn);

	let conversationId: string;
	let messageId: string | undefined;
	let isNewConversation = false;

	if (existingConversation) {
		// Step 3a: Send message to existing conversation
		conversationId = existingConversation.id;
		const sendResult = await sendToExistingConversation(client, conversationId, message);
		messageId = sendResult.messageId;
	} else {
		// Step 3b: Create new conversation with message
		const createResult = await createConversationWithMessage(client, resolvedProfile.urn, message);
		conversationId = createResult.conversationId;
		messageId = createResult.messageId;
		isNewConversation = true;
	}

	const result: SendResult = {
		success: true,
		recipient: {
			username: resolvedProfile.username,
			urn: resolvedProfile.urn,
		},
		conversationId,
		messageId,
		isNewConversation,
	};

	if (options.json) {
		return formatJson(result);
	}

	return formatHumanOutput(result);
}

/**
 * Resolve a recipient identifier to a profile URN.
 */
async function resolveRecipient(
	client: LinkedInClient,
	recipient: string,
): Promise<{ username: string; urn: string }> {
	// Parse the input to determine type
	const parsed = parseLinkedInUrl(recipient);

	let username: string;

	if (parsed?.type === "profile") {
		if (parsed.identifier.startsWith("urn:li:")) {
			// It's a URN - we need to look up the username
			const response = await client.request(
				`/identity/dash/profiles?q=memberIdentity&memberIdentity=${encodeURIComponent(parsed.identifier)}`,
				{ method: "GET" },
			);
			const data = (await response.json()) as ProfileLookupResponse;

			if (!data.elements || data.elements.length === 0) {
				throw new Error(`Profile not found for URN: ${parsed.identifier}`);
			}

			return {
				username: data.elements[0].publicIdentifier ?? "",
				urn: data.elements[0].entityUrn,
			};
		}
		username = parsed.identifier;
	} else {
		// Treat as plain username
		username = recipient.trim();
	}

	// Look up the profile URN by username
	const response = await client.request(
		`/identity/dash/profiles?q=memberIdentity&memberIdentity=${encodeURIComponent(username)}`,
		{ method: "GET" },
	);
	const data = (await response.json()) as ProfileLookupResponse;

	if (!data.elements || data.elements.length === 0) {
		throw new Error(`Profile not found: ${username}`);
	}

	return {
		username: data.elements[0].publicIdentifier ?? username,
		urn: data.elements[0].entityUrn,
	};
}

/**
 * Check if there's an existing conversation with the recipient.
 */
async function findExistingConversation(
	client: LinkedInClient,
	profileUrn: string,
): Promise<{ id: string } | null> {
	const encodedUrn = encodeURIComponent(profileUrn);
	const response = await client.request(
		`/messaging/conversations?q=participants&recipients=List(${encodedUrn})`,
		{ method: "GET" },
	);
	const data = (await response.json()) as ConversationLookupResponse;

	if (data.elements && data.elements.length > 0) {
		// Extract conversation ID from URN
		// URN format: urn:li:msg_conversation:CONV_ID
		const urn = data.elements[0].entityUrn;
		const id = extractConversationId(urn);
		return { id };
	}

	return null;
}

/**
 * Extract conversation ID from URN.
 * Example: "urn:li:msg_conversation:ABC123" -> "ABC123"
 */
function extractConversationId(urn: string): string {
	const match = urn.match(/urn:li:msg_conversation:(.+)$/);
	return match?.[1] ?? urn;
}

/**
 * Send a message to an existing conversation.
 */
async function sendToExistingConversation(
	client: LinkedInClient,
	conversationId: string,
	message: string,
): Promise<{ messageId?: string }> {
	const body = JSON.stringify({
		eventCreate: {
			value: {
				"com.linkedin.voyager.messaging.create.MessageCreate": {
					body: message,
					attachments: [],
				},
			},
		},
	});

	const response = await client.request(`/messaging/conversations/${conversationId}/events`, {
		method: "POST",
		body,
		headers: {
			"Content-Type": "application/json",
		},
	});

	const data = (await response.json()) as SendMessageResponse;
	return {
		messageId: data.value?.entityUrn,
	};
}

/**
 * Create a new conversation with the first message.
 */
async function createConversationWithMessage(
	client: LinkedInClient,
	recipientUrn: string,
	message: string,
): Promise<{ conversationId: string; messageId?: string }> {
	const body = JSON.stringify({
		conversationCreate: {
			recipients: [recipientUrn],
			eventCreate: {
				value: {
					"com.linkedin.voyager.messaging.create.MessageCreate": {
						body: message,
						attachments: [],
					},
				},
			},
		},
	});

	const response = await client.request("/messaging/conversations", {
		method: "POST",
		body,
		headers: {
			"Content-Type": "application/json",
		},
	});

	const data = (await response.json()) as {
		value?: {
			entityUrn?: string;
			dashEntityUrn?: string;
		};
	};

	const conversationUrn = data.value?.entityUrn ?? data.value?.dashEntityUrn ?? "";
	const conversationId = extractConversationId(conversationUrn);

	return {
		conversationId,
		messageId: undefined,
	};
}

/**
 * Format send result for human-readable output.
 */
function formatHumanOutput(result: SendResult): string {
	const checkmark = pc.green("\u2714");
	const action = result.isNewConversation ? "sent (new conversation)" : "sent";

	return `${checkmark} Message ${action} to @${result.recipient.username}`;
}
