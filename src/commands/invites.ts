/**
 * Invites command - List and accept pending LinkedIn connection invitations.
 *
 * Supports:
 * - Listing pending invitations with inviter info, message, and shared connections
 * - Accepting invitations by ID or URN
 */

import type { LinkedInCredentials } from "../lib/auth.js";
import { LinkedInClient } from "../lib/client.js";
import endpoints from "../lib/endpoints.json" with { type: "json" };
import { parseInvitation } from "../lib/parser.js";
import { formatInvitation } from "../output/human.js";
import { formatJson } from "../output/json.js";
import type { NormalizedInvitation } from "../output/types.js";

export interface InvitesOptions {
	json?: boolean;
}

interface InvitationsResponse {
	elements?: Array<Record<string, unknown>>;
	paging?: {
		total: number;
		count: number;
		start: number;
	};
}

interface ListInvitesResult {
	invitations: NormalizedInvitation[];
	total: number;
}

interface AcceptInviteResult {
	success: boolean;
	invitationId: string;
}

/**
 * Extract the invitation ID from a URN.
 */
function extractIdFromUrn(urn: string): string {
	// Handle URN format: urn:li:fsd_invitation:INV123
	if (urn.startsWith("urn:li:")) {
		const parts = urn.split(":");
		return parts[parts.length - 1];
	}
	return urn;
}

/**
 * Transform parser output to the format expected by human.ts formatInvitation.
 */
function transformInvitation(raw: Record<string, unknown>): NormalizedInvitation {
	const parsed = parseInvitation(raw);

	return {
		invitationId: extractIdFromUrn(parsed.urn),
		inviter: {
			urn: "",
			username: parsed.inviter.username,
			firstName: parsed.inviter.name.split(" ")[0] || "",
			lastName: parsed.inviter.name.split(" ").slice(1).join(" ") || "",
			headline: parsed.inviter.headline,
			profileUrl: `https://www.linkedin.com/in/${parsed.inviter.username}`,
		},
		message: parsed.message || undefined,
		sentAt: parsed.sentTime,
		sharedConnections: parsed.sharedConnectionsCount,
	};
}

/**
 * List pending connection invitations.
 *
 * @param credentials - LinkedIn session credentials
 * @param options - Command options (json output)
 * @returns Formatted output string (human-readable or JSON)
 */
export async function listInvites(
	credentials: LinkedInCredentials,
	options: InvitesOptions = {},
): Promise<string> {
	const client = new LinkedInClient(credentials);

	const response = await client.request(endpoints.endpoints.invitations);
	const data = (await response.json()) as InvitationsResponse;

	const elements = data.elements || [];
	const invitations = elements.map((el) => transformInvitation(el));
	const total = data.paging?.total || invitations.length;

	if (options.json) {
		const result: ListInvitesResult = {
			invitations,
			total,
		};
		return formatJson(result);
	}

	// Human-readable output
	if (invitations.length === 0) {
		return "No pending invitations";
	}

	const lines: string[] = [];
	lines.push(`Pending invitations (${total}):\n`);

	for (const invite of invitations) {
		lines.push(formatInvitation(invite));
		lines.push(""); // Empty line between invitations
	}

	return lines.join("\n").trim();
}

/**
 * Accept a pending connection invitation.
 *
 * @param credentials - LinkedIn session credentials
 * @param invitationId - Invitation ID or URN
 * @param options - Command options (json output)
 * @returns Formatted output string (human-readable or JSON)
 */
export async function acceptInvite(
	credentials: LinkedInCredentials,
	invitationId: string,
	options: InvitesOptions = {},
): Promise<string> {
	if (!invitationId || invitationId.trim() === "") {
		throw new Error("Invalid invitation ID: ID is required");
	}

	const client = new LinkedInClient(credentials);
	const id = extractIdFromUrn(invitationId);

	const path = endpoints.endpoints.acceptInvitation.replace("{id}", id);
	const payload = {
		action: "ACCEPT",
	};

	await client.request(path, {
		method: "PUT",
		body: JSON.stringify(payload),
		headers: {
			"Content-Type": "application/json",
		},
	});

	if (options.json) {
		const result: AcceptInviteResult = {
			success: true,
			invitationId: id,
		};
		return formatJson(result);
	}

	return `Invitation ${id} accepted`;
}
