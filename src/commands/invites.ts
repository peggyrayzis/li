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
import { buildHeaders } from "../lib/headers.js";
import { parseInvitationsFromFlagshipRsc } from "../lib/parser.js";
import type { NormalizedInvitation } from "../lib/types.js";
import { extractIdFromUrn } from "../lib/url-parser.js";
import { formatInvitation } from "../output/human.js";
import { formatJson } from "../output/json.js";

export interface InvitesOptions {
	json?: boolean;
	includeSecrets?: boolean;
}

type PublicInvitation = Omit<NormalizedInvitation, "invitationId" | "urn" | "sharedSecret">;

interface ListInvitesResult {
	invitations: NormalizedInvitation[] | PublicInvitation[];
	total: number;
}

interface AcceptInviteResult {
	success: boolean;
	invitationId: string;
}

const FLAGSHIP_INVITES_URL =
	"https://www.linkedin.com/flagship-web/rsc-action/actions/pagination?sduiid=com.linkedin.sdui.pagers.mynetwork.invitationsList";
const FLAGSHIP_INVITES_REFERER = "https://www.linkedin.com/mynetwork/invitation-manager/received/";
const FLAGSHIP_PAGE_INSTANCE =
	"urn:li:page:d_flagship3_people_invitations;fkBHD5OCSzq7lUUo2+5Oiw==";
const FLAGSHIP_TRACK =
	'{"clientVersion":"0.2.3802","mpVersion":"0.2.3802","osName":"web","timezoneOffset":-5,"timezone":"America/New_York","deviceFormFactor":"DESKTOP","mpName":"web","displayDensity":2,"displayWidth":3024,"displayHeight":1964}';
const DEBUG_INVITES =
	process.env.LI_DEBUG_INVITES === "1" || process.env.LI_DEBUG_INVITES === "true";

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

	const headers = {
		...buildHeaders(credentials),
		Accept: "*/*",
		"Content-Type": "application/json",
		Origin: "https://www.linkedin.com",
		Referer: FLAGSHIP_INVITES_REFERER,
		"X-Li-Page-Instance": FLAGSHIP_PAGE_INSTANCE,
		"X-Li-Track": FLAGSHIP_TRACK,
	};

	const response = await client.requestAbsolute(FLAGSHIP_INVITES_URL, {
		method: "POST",
		headers,
		body: JSON.stringify(buildInvitesPaginationBody(0)),
	});

	const buffer = await response.arrayBuffer();
	const payload = new TextDecoder("utf-8").decode(buffer);
	if (DEBUG_INVITES) {
		const preview = payload.slice(0, 2000);
		process.stderr.write(`[li][invites] payload_length=${payload.length} preview=${preview}\n`);
	}
	const invitations = parseInvitationsFromFlagshipRsc(payload);
	const total = invitations.length;

	if (options.json) {
		const invitationsForOutput = options.includeSecrets
			? invitations
			: invitations.map((invite) => ({
					type: invite.type,
					inviter: invite.inviter,
					message: invite.message,
					sharedConnections: invite.sharedConnections,
					sentAt: invite.sentAt,
				}));
		const result: ListInvitesResult = {
			invitations: invitationsForOutput,
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

function buildInvitesPaginationBody(startIndex: number): Record<string, unknown> {
	return {
		pagerId: "com.linkedin.sdui.pagers.mynetwork.invitationsList",
		clientArguments: {
			$type: "proto.sdui.actions.requests.RequestedArguments",
			payload: {
				startIndex,
				invitationTypeEnum: [
					"GenericInvitationType_CONNECTION",
					"GenericInvitationType_ORGANIZATION",
					"GenericInvitationType_EVENT",
					"GenericInvitationType_CONTENT_SERIES",
					"GenericInvitationType_MEMBER_FOLLOW",
				],
				filterCriteriaEnum: "FilterCriteria_UNKNOWN",
				invitationDirectionEnum: "PendingInvitationDirection_RECEIVED",
			},
			requestedStateKeys: [],
			requestMetadata: { $type: "proto.sdui.common.RequestMetadata" },
			states: [],
			screenId: "com.linkedin.sdui.flagshipnav.mynetwork.invitations.InvitationReceivedWithType",
		},
		paginationRequest: {
			$type: "proto.sdui.actions.requests.PaginationRequest",
			pagerId: "com.linkedin.sdui.pagers.mynetwork.invitationsList",
			requestedArguments: {
				$type: "proto.sdui.actions.requests.RequestedArguments",
				payload: {
					startIndex,
					invitationTypeEnum: [
						"GenericInvitationType_CONNECTION",
						"GenericInvitationType_ORGANIZATION",
						"GenericInvitationType_EVENT",
						"GenericInvitationType_CONTENT_SERIES",
						"GenericInvitationType_MEMBER_FOLLOW",
					],
					filterCriteriaEnum: "FilterCriteria_UNKNOWN",
					invitationDirectionEnum: "PendingInvitationDirection_RECEIVED",
				},
				requestedStateKeys: [],
				requestMetadata: { $type: "proto.sdui.common.RequestMetadata" },
			},
			trigger: {
				$case: "itemDistanceTrigger",
				itemDistanceTrigger: {
					$type: "proto.sdui.actions.requests.ItemDistanceTrigger",
					preloadDistance: 3,
					preloadLength: 250,
				},
			},
			retryCount: 2,
		},
	};
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
