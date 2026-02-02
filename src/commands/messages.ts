/**
 * Messages command - List conversations and read message threads.
 *
 * Supports two modes:
 * - List conversations (default or "list" subcommand)
 * - Read a specific conversation ("read" subcommand with conversation ID)
 */

import { existsSync, readFileSync } from "node:fs";
import type { LinkedInCredentials } from "../lib/auth.js";
import { LinkedInApiError, LinkedInClient } from "../lib/client.js";
import { parseConversation, parseMessage } from "../lib/parser.js";
import { runtimeQueryIds } from "../lib/runtime-query-ids.js";
import type { NormalizedConversation, NormalizedMessage } from "../lib/types.js";
import { formatConversation, formatMessage, formatPagination } from "../output/human.js";
import { formatJson } from "../output/json.js";

const DEBUG_MESSAGES =
	process.env.LI_DEBUG_MESSAGES === "1" || process.env.LI_DEBUG_MESSAGES === "true";
const DEBUG_MESSAGES_RESPONSE =
	process.env.LI_DEBUG_MESSAGES_RESPONSE === "1" ||
	process.env.LI_DEBUG_MESSAGES_RESPONSE === "true";
const MESSAGING_QUERY_ID_OPERATIONS = ["messengerConversations"] as const;

function debugMessages(message: string): void {
	if (!DEBUG_MESSAGES) {
		return;
	}
	process.stderr.write(`[li][messages] ${message}\n`);
}

async function debugResponseBody(response: Response): Promise<void> {
	if (!DEBUG_MESSAGES_RESPONSE) {
		return;
	}
	try {
		const clone = response.clone();
		const text = await clone.text();
		const preview = text.slice(0, 500);
		process.stderr.write(`[li][messages] response_preview=${preview}\n`);
	} catch {
		// Ignore response debug failures.
	}
}

function isQueryIdError(error: unknown): error is LinkedInApiError {
	return (
		error instanceof LinkedInApiError &&
		(error.status === 400 || error.status === 403 || error.status === 404)
	);
}

async function requestConversations(
	client: LinkedInClient,
	credentials: LinkedInCredentials,
	queryId: string,
	variables: string,
	headers: Record<string, string>,
): Promise<Response> {
	const requestHeaders = {
		...headers,
		Accept: "application/graphql",
		"X-Li-Graphql-Token": credentials.csrfToken,
	};
	return client.request(
		`/voyagerMessagingGraphQL/graphql?queryId=${queryId}&variables=${variables}`,
		{ method: "GET", headers: requestHeaders },
	);
}

export interface MessagesOptions {
	json?: boolean;
	start?: number;
	count?: number;
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

interface ConversationsGraphQLResponse {
	data?: {
		messengerConversationsBySyncToken?: {
			elements?: Array<Record<string, unknown>>;
		};
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
	const apiCount = 20;

	const mailboxUrn = await resolveMailboxUrn(client);
	const snapshotInfo = await runtimeQueryIds.getSnapshotInfo();
	const snapshotHeaders = snapshotInfo?.snapshot.headers ?? {};
	const snapshotVariables = snapshotInfo?.snapshot.variables?.messengerConversations;
	const lastUpdatedBefore = Date.now();
	const query = "(predicateUnions:List((conversationCategoryPredicate:(category:PRIMARY_INBOX))))";
	const computedVariables = `(query:${query},count:${apiCount},mailboxUrn:${encodeURIComponent(mailboxUrn)},lastUpdatedBefore:${lastUpdatedBefore})`;
	const variables = snapshotVariables
		? snapshotVariables.replace(
				/mailboxUrn:([^,)]+)/,
				(_, value: string) => `mailboxUrn:${encodeURIComponent(value)}`,
			)
		: computedVariables;
	const queryId = await resolveMessagingQueryId();
	debugMessages(`queryId=${queryId} variables=${variables}`);
	if (Object.keys(snapshotHeaders).length > 0) {
		debugMessages(`headers=${JSON.stringify(snapshotHeaders)}`);
	}
	let response: Response;
	try {
		response = await requestConversations(
			client,
			credentials,
			queryId,
			variables,
			snapshotHeaders,
		);
		await debugResponseBody(response);
	} catch (error) {
		if (!isQueryIdError(error)) {
			throw error;
		}

		try {
			await runtimeQueryIds.refreshFromLinkedIn(client, [...MESSAGING_QUERY_ID_OPERATIONS]);
			const refreshedQueryId = await resolveMessagingQueryId();
			const refreshedSnapshot = await runtimeQueryIds.getSnapshotInfo();
			const refreshedHeaders = refreshedSnapshot?.snapshot.headers ?? {};
			response = await requestConversations(
				client,
				credentials,
				refreshedQueryId,
				variables,
				refreshedHeaders,
			);
			await debugResponseBody(response);
		} catch (refreshError) {
			if (!isQueryIdError(refreshError)) {
				throw refreshError;
			}

			const harPath =
				process.env.LINKEDIN_MESSAGING_HAR ?? "www.linkedin.com.fullv3.har";
			if (!existsSync(harPath)) {
				throw new Error(
					"Messaging queryId appears stale and could not be refreshed automatically. " +
						"Export a HAR from linkedin.com/messaging and run: " +
						"li query-ids --refresh --har <path> " +
						"or set LINKEDIN_MESSAGING_HAR to the HAR path.",
				);
			}

			await runtimeQueryIds.refreshFromHar([...MESSAGING_QUERY_ID_OPERATIONS], harPath);
			const harQueryId = await resolveMessagingQueryId();
			const harSnapshot = await runtimeQueryIds.getSnapshotInfo();
			const harHeaders = harSnapshot?.snapshot.headers ?? {};
			response = await requestConversations(
				client,
				credentials,
				harQueryId,
				variables,
				harHeaders,
			);
			await debugResponseBody(response);
		}
	}

	const data = (await response.json()) as ConversationsGraphQLResponse;
	const elements = data.data?.messengerConversationsBySyncToken?.elements ?? [];

	const conversations = elements.map((element) => parseConversation(element));
	const pagedConversations = conversations.slice(start, start + count);
	const total = conversations.length;

	const result: ListConversationsResult = {
		conversations: pagedConversations,
		paging: {
			total: Math.max(total, start + pagedConversations.length),
			count: pagedConversations.length,
			start,
		},
	};

	if (options.json) {
		return formatJson(result);
	}

	return formatHumanConversationsList(result);
}

async function resolveMailboxUrn(client: LinkedInClient): Promise<string> {
	const response = await client.request("/me", { method: "GET" });
	const data = (await response.json()) as Record<string, unknown>;
	const miniProfile =
		(data.miniProfile as Record<string, unknown> | undefined) ??
		(data.included as Array<Record<string, unknown>> | undefined)?.find(
			(item) => typeof item.publicIdentifier === "string",
		);
	const username = (miniProfile?.publicIdentifier as string | undefined) ?? "";
	const urn =
		(miniProfile?.entityUrn as string | undefined) ??
		(miniProfile?.dashEntityUrn as string | undefined) ??
		"";

	if (urn.startsWith("urn:li:fs_miniProfile:")) {
		return lookupProfileUrnByUsername(client, username, {
			fallback: urn.replace("urn:li:fs_miniProfile:", "urn:li:fsd_profile:"),
		});
	}

	if (urn.startsWith("urn:li:fsd_profile:")) {
		return urn;
	}

	if (username) {
		return lookupProfileUrnByUsername(client, username);
	}

	throw new Error("Could not resolve mailbox URN from /me response");
}

async function lookupProfileUrnByUsername(
	client: LinkedInClient,
	username: string,
	options: { fallback?: string } = {},
): Promise<string> {
	if (!username) {
		if (options.fallback) {
			return options.fallback;
		}
		throw new Error("Could not resolve mailbox URN from /me response");
	}

	const response = await client.request(
		`/identity/dash/profiles?q=memberIdentity&memberIdentity=${encodeURIComponent(username)}`,
		{ method: "GET" },
	);
	const data = (await response.json()) as { elements?: Array<{ entityUrn?: string }> };
	const urn = data.elements?.[0]?.entityUrn;

	if (urn) {
		return urn;
	}

	if (options.fallback) {
		return options.fallback;
	}

	throw new Error("Could not resolve mailbox URN from /me response");
}

async function resolveMessagingQueryId(): Promise<string> {
	if (process.env.LINKEDIN_MESSAGING_QUERY_ID) {
		return process.env.LINKEDIN_MESSAGING_QUERY_ID;
	}

	const cached = await runtimeQueryIds.getId("messengerConversations");
	if (cached) {
		return cached;
	}

	const harPath = process.env.LINKEDIN_MESSAGING_HAR ?? "www.linkedin.com.fullv3.har";
	if (existsSync(harPath)) {
		try {
			const raw = readFileSync(harPath, "utf8");
			const parsed = JSON.parse(raw) as {
				log?: { entries?: Array<{ request?: { url?: string } }> };
			};
			const entries = parsed.log?.entries ?? [];
			for (const entry of entries) {
				const url = entry.request?.url ?? "";
				if (
					url.includes("voyagerMessagingGraphQL/graphql") &&
					url.includes("messengerConversations")
				) {
					const query = url.split("?")[1] ?? "";
					const params = new URLSearchParams(query);
					const queryId = params.get("queryId");
					if (queryId) {
						return queryId;
					}
				}
			}
		} catch {
			// Fall through to default queryId.
		}
	}

	return "messengerConversations.0d5e6781bbee71c3e51c8843c6519f48";
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
	lines.push(`${formatPagination(start, end, total)} conversations`);

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
