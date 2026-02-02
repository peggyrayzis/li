/**
 * Messages command - List conversations and read message threads.
 *
 * Supports two modes:
 * - List conversations (default or "list" subcommand)
 * - Read a specific conversation ("read" subcommand with conversation ID)
 */

import type { LinkedInCredentials } from "../lib/auth.js";
import { LinkedInClient } from "../lib/client.js";
import { parseConversation, parseMessage } from "../lib/parser.js";
import type { NormalizedConversation, NormalizedMessage } from "../lib/types.js";
import { formatConversation, formatMessage } from "../output/human.js";
import { formatJson } from "../output/json.js";

export interface MessagesOptions {
	json?: boolean;
	start?: number;
	count?: number;
}

interface ConversationsApiResponse {
	elements: Array<Record<string, unknown>>;
	paging: {
		total: number;
		count: number;
		start: number;
	};
}

interface EventsApiResponse {
	elements: Array<Record<string, unknown>>;
	paging: {
		total: number;
		count: number;
		start: number;
	};
}

interface ListConversationsResult {
	conversations: NormalizedConversation[];
	paging: {
		total: number;
		count: number;
		start: number;
	};
}

interface ReadConversationResult {
	messages: NormalizedMessage[];
	paging: {
		total: number;
		count: number;
		start: number;
	};
}

/**
 * List recent conversations.
 *
 * @param credentials - LinkedIn credentials
 * @param options - Command options (json, start, count)
 * @returns Formatted output string (human-readable or JSON)
 */
export async function listConversations(
	credentials: LinkedInCredentials,
	options: MessagesOptions = {},
): Promise<string> {
	const client = new LinkedInClient(credentials);
	const start = options.start ?? 0;
	const count = Math.min(options.count ?? 20, 50);

	const response = await client.request(
		`/messaging/conversations?keyVersion=LEGACY_INBOX&start=${start}&count=${count}`,
		{ method: "GET" },
	);
	const data = (await response.json()) as ConversationsApiResponse;

	const conversations = data.elements.map((element) => parseConversation(element));

	const result: ListConversationsResult = {
		conversations,
		paging: data.paging,
	};

	if (options.json) {
		return formatJson(result);
	}

	return formatHumanConversationsList(result);
}

/**
 * Read messages in a specific conversation.
 *
 * @param credentials - LinkedIn credentials
 * @param conversationId - Conversation ID (from the URN)
 * @param options - Command options (json, start, count)
 * @returns Formatted output string (human-readable or JSON)
 */
export async function readConversation(
	credentials: LinkedInCredentials,
	conversationId: string,
	options: MessagesOptions = {},
): Promise<string> {
	const client = new LinkedInClient(credentials);
	const start = options.start ?? 0;
	const count = Math.min(options.count ?? 20, 50);

	const response = await client.request(
		`/messaging/conversations/${conversationId}/events?start=${start}&count=${count}`,
		{ method: "GET" },
	);
	const data = (await response.json()) as EventsApiResponse;

	const messages = data.elements.map((element) => parseMessage(element, conversationId));

	const result: ReadConversationResult = {
		messages,
		paging: data.paging,
	};

	if (options.json) {
		return formatJson(result);
	}

	return formatHumanMessagesList(result);
}

/**
 * Format conversations list for human-readable output.
 */
function formatHumanConversationsList(result: ListConversationsResult): string {
	if (result.conversations.length === 0) {
		return "No conversations found.";
	}

	const lines: string[] = [];

	for (const convo of result.conversations) {
		lines.push(formatConversation(convo));
		lines.push(""); // Add blank line between conversations
	}

	// Add paging info
	const { start, count, total } = result.paging;
	const end = Math.min(start + count, total);
	lines.push(`Showing ${start + 1}-${end} of ${total.toLocaleString()} conversations`);

	return lines.join("\n");
}

/**
 * Format messages list for human-readable output.
 */
function formatHumanMessagesList(result: ReadConversationResult): string {
	if (result.messages.length === 0) {
		return "No messages in this conversation.";
	}

	const lines: string[] = [];

	for (const message of result.messages) {
		lines.push(formatMessage(message));
		lines.push(""); // Add blank line between messages
	}

	return lines.join("\n").trim();
}
