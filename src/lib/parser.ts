/**
 * Parser for LinkedIn Voyager API responses.
 * Normalizes raw API responses into clean, typed objects.
 */

import {
	LINKEDIN_PROFILE_BASE_URL,
	type NormalizedConnection,
	type NormalizedConversation,
	type NormalizedInvitation,
	type NormalizedMessage,
	type NormalizedProfile,
} from "./types.js";

// Re-export types for backwards compatibility
export type {
	NormalizedConnection,
	NormalizedConversation,
	NormalizedInvitation,
	NormalizedMessage,
	NormalizedProfile,
} from "./types.js";

/**
 * Localized field structure used by LinkedIn.
 * Example: { localized: { en_US: "value" }, preferredLocale: { country: "US", language: "en" } }
 */
interface LocalizedField {
	localized?: Record<string, string>;
	preferredLocale?: {
		country: string;
		language: string;
	};
}

interface TextField {
	text?: string;
}

/**
 * Extracts the value from a LinkedIn localized field object.
 * Prefers en_US locale, falls back to first available locale.
 *
 * @param field - The localized field object or plain string
 * @returns The extracted string value, or empty string if not found
 */
export function extractLocalized(field: LocalizedField | string | null | undefined): string {
	if (field === null || field === undefined) {
		return "";
	}

	if (typeof field === "string") {
		return field;
	}

	const localized = field.localized;
	if (!localized || typeof localized !== "object") {
		return "";
	}

	// Prefer en_US locale
	if (localized.en_US !== undefined) {
		return localized.en_US;
	}

	// Fall back to first available locale
	const keys = Object.keys(localized);
	if (keys.length > 0) {
		return localized[keys[0]];
	}

	return "";
}

/**
 * Extracts the value from a LinkedIn text field object.
 */
function extractText(field: TextField | string | null | undefined): string {
	if (field === null || field === undefined) {
		return "";
	}

	if (typeof field === "string") {
		return field;
	}

	if (typeof field.text === "string") {
		return field.text;
	}

	return "";
}

function extractString(value: unknown): string | undefined {
	if (typeof value === "string") {
		return value;
	}
	return undefined;
}

/**
 * Extract ID from a LinkedIn URN.
 * @param urn - URN like "urn:li:fsd_invitation:INV123"
 * @returns The ID portion, e.g., "INV123"
 */
function extractIdFromUrn(urn: string): string {
	if (urn.startsWith("urn:li:")) {
		const parts = urn.split(":");
		return parts[parts.length - 1];
	}
	return urn;
}

/**
 * Parse a mini profile (used in conversations and invitations) into NormalizedConnection.
 */
function parseMiniProfile(
	miniProfile: Record<string, unknown> | undefined,
	urn = "",
): NormalizedConnection {
	if (!miniProfile) {
		return {
			urn,
			username: "",
			firstName: "",
			lastName: "",
			headline: "",
			profileUrl: LINKEDIN_PROFILE_BASE_URL,
		};
	}

	const username = (miniProfile.publicIdentifier as string) || "";
	const firstName = (miniProfile.firstName as string) || "";
	const lastName = (miniProfile.lastName as string) || "";

	return {
		urn,
		username,
		firstName,
		lastName,
		headline: (miniProfile.occupation as string) || "",
		profileUrl: `${LINKEDIN_PROFILE_BASE_URL}${username}`,
	};
}

function extractUsernameFromProfileUrl(profileUrl: string): string {
	const match = profileUrl.match(/\/in\/([^/?#]+)/);
	return match ? match[1] : "";
}

function parseParticipantType(
	participantType: Record<string, unknown> | undefined,
	urn = "",
): NormalizedConnection {
	const member = participantType?.member as Record<string, unknown> | undefined;
	if (member) {
		const profileUrl = (member.profileUrl as string) || LINKEDIN_PROFILE_BASE_URL;
		return {
			urn,
			username: extractUsernameFromProfileUrl(profileUrl),
			firstName: extractText(member.firstName as TextField),
			lastName: extractText(member.lastName as TextField),
			headline: extractText(member.headline as TextField),
			profileUrl,
		};
	}

	const organization = participantType?.organization as Record<string, unknown> | undefined;
	if (organization) {
		const profileUrl = (organization.pageUrl as string) || LINKEDIN_PROFILE_BASE_URL;
		return {
			urn,
			username: extractUsernameFromProfileUrl(profileUrl),
			firstName: extractText(organization.name as TextField),
			lastName: "",
			headline: extractText(organization.tagline as TextField),
			profileUrl,
		};
	}

	return {
		urn,
		username: "",
		firstName: "",
		lastName: "",
		headline: "",
		profileUrl: LINKEDIN_PROFILE_BASE_URL,
	};
}

/**
 * Parses a raw profile response from Voyager API.
 * Works with both /identity/profiles/{slug}/profileView and /identity/dash/profiles responses.
 *
 * @param raw - Raw profile data from API
 * @returns Normalized profile object
 */
export function parseProfile(raw: Record<string, unknown>): NormalizedProfile {
	const dataBag = raw.data as Record<string, unknown> | undefined;
	const included = raw.included as Array<Record<string, unknown>> | undefined;

	const profileUrn =
		extractString(dataBag?.["*profile"]) ??
		extractString(dataBag?.profile) ??
		extractString((raw.profile as Record<string, unknown> | undefined)?.entityUrn) ??
		extractString(raw.entityUrn);

	const includedProfile =
		included?.find((item) => item.entityUrn === profileUrn) ??
		included?.find((item) => typeof item.publicIdentifier === "string") ??
		undefined;

	const dashProfile =
		(raw.profile as Record<string, unknown>) ||
		(dataBag?.profile as Record<string, unknown>) ||
		includedProfile ||
		raw;

	const firstName = extractLocalized(dashProfile.firstName as LocalizedField);
	const lastName = extractLocalized(dashProfile.lastName as LocalizedField);
	const username = (dashProfile.publicIdentifier as string) || "";
	const industry = extractLocalized(dashProfile.industryName as LocalizedField);
	const summary = extractLocalized(dashProfile.summary as LocalizedField);

	const dashUrn = extractString(dashProfile.entityUrn);

	return {
		urn: dashUrn || profileUrn || "",
		username,
		firstName,
		lastName,
		headline: extractLocalized(dashProfile.headline as LocalizedField),
		location: extractLocalized(dashProfile.locationName as LocalizedField),
		profileUrl: `${LINKEDIN_PROFILE_BASE_URL}${username}`,
		...(industry && { industry }),
		...(summary && { summary }),
	};
}

/**
 * Parses a connection element from /relationships/dash/connections response.
 * Connection elements have a "to~" field containing the profile data.
 *
 * @param raw - Raw connection element from API
 * @returns Normalized connection object
 */
export function parseConnection(raw: Record<string, unknown>): NormalizedConnection {
	const profile = raw["to~"] as Record<string, unknown> | undefined;
	const urn = (raw.to as string) || "";

	if (!profile) {
		return {
			urn,
			username: "",
			firstName: "",
			lastName: "",
			headline: "",
			profileUrl: LINKEDIN_PROFILE_BASE_URL,
		};
	}

	const firstName = extractLocalized(profile.firstName as LocalizedField);
	const lastName = extractLocalized(profile.lastName as LocalizedField);
	const username = (profile.publicIdentifier as string) || "";

	return {
		urn,
		username,
		firstName,
		lastName,
		headline: extractLocalized(profile.headline as LocalizedField),
		profileUrl: `${LINKEDIN_PROFILE_BASE_URL}${username}`,
	};
}

/**
 * Parses connections from LinkedIn flagship-web RSC payloads.
 * These payloads are not JSON and require regex extraction.
 */
export function parseConnectionsFromFlagshipRsc(payload: string): NormalizedConnection[] {
	const normalizedPayload = payload.replace(/\\\//g, "/");
	const connectionRegex = new RegExp(
		String.raw`"url":"(https://www\.linkedin\.com/in/[^"]+)"[\s\S]{0,800}?"children":\["([^"]+)"\][\s\S]{0,800}?"children":\["([^"]+)"\]`,
		"g",
	);

	const results: NormalizedConnection[] = [];
	const seen = new Set<string>();

	for (;;) {
		const match = connectionRegex.exec(normalizedPayload);
		if (!match) {
			break;
		}
		const rawUrl = match[1];
		const name = match[2].trim();
		const headline = match[3].trim();

		const profileUrl = rawUrl.replace(/\/$/, "");
		const usernameMatch = profileUrl.match(/\/in\/([^/?#]+)/);
		const username = usernameMatch ? usernameMatch[1] : "";

		if (!username || seen.has(username)) {
			continue;
		}

		const nameParts = name.split(/\s+/);
		const firstName = nameParts[0] ?? "";
		const lastName = nameParts.slice(1).join(" ");

		seen.add(username);
		results.push({
			urn: "",
			username,
			firstName,
			lastName,
			headline,
			profileUrl,
		});
	}

	return results;
}

/**
 * Parses invitations from LinkedIn flagship-web RSC payloads.
 * These payloads are not JSON and require regex extraction.
 */
export function parseInvitationsFromFlagshipRsc(payload: string): NormalizedInvitation[] {
	const invitationRegex = new RegExp(
		String.raw`"entityUrn":"(urn:li:fsd_invitation:[^"]+)"[\s\S]{0,4000}?"sharedSecret":"([^"]*)"[\s\S]{0,4000}?"invitationType":"([^"]+)"[\s\S]{0,4000}?"sentTime":(\d+)[\s\S]{0,4000}?"sharedConnections":\{"count":(\d+)\}[\s\S]{0,4000}?"miniProfile":\{([\s\S]{0,2000}?)\}`,
		"g",
	);

	const results: NormalizedInvitation[] = [];
	const seen = new Set<string>();

	for (;;) {
		const match = invitationRegex.exec(payload);
		if (!match) {
			break;
		}
		const urn = match[1];
		const sharedSecret = match[2];
		const invitationType = match[3];
		const sentTime = Number(match[4] ?? 0);
		const sharedConnections = Number(match[5] ?? 0);
		const miniProfileChunk = match[6] ?? "";
		const nextInvitationIndex = payload.indexOf(
			'"entityUrn":"urn:li:fsd_invitation:',
			match.index + 1,
		);
		const chunk = payload.slice(
			match.index,
			nextInvitationIndex === -1 ? payload.length : nextInvitationIndex,
		);
		const messageMatch = chunk.match(/"message":"([^"]+)"/);

		if (!urn || seen.has(urn)) {
			continue;
		}

		const usernameMatch = miniProfileChunk.match(/"publicIdentifier":"([^"]+)"/);
		const firstNameMatch = miniProfileChunk.match(/"firstName":"([^"]+)"/);
		const lastNameMatch = miniProfileChunk.match(/"lastName":"([^"]+)"/);
		const headlineMatch = miniProfileChunk.match(/"(?:occupation|headline)":"([^"]*)"/);

		const rawInvitation: Record<string, unknown> = {
			entityUrn: urn,
			sharedSecret,
			invitationType,
			sentTime,
			sharedConnections: { count: sharedConnections },
			genericInviter: {
				miniProfile: {
					publicIdentifier: usernameMatch?.[1] ?? "",
					firstName: firstNameMatch?.[1] ?? "",
					lastName: lastNameMatch?.[1] ?? "",
					occupation: headlineMatch?.[1] ?? "",
				},
			},
		};

		if (messageMatch?.[1]) {
			rawInvitation.message = messageMatch[1];
		}

		results.push(parseInvitation(rawInvitation));
		seen.add(urn);
	}

	return results;
}

/**
 * Parses a message event from conversation events array.
 *
 * @param raw - Raw message event from API
 * @param conversationId - Optional conversation ID for the message
 * @returns Normalized message object
 */
export function parseMessage(raw: Record<string, unknown>, conversationId = ""): NormalizedMessage {
	const eventContent = raw.eventContent as Record<string, unknown> | undefined;
	const messageEvent = eventContent?.messageEvent as Record<string, unknown> | undefined;
	const from = raw.from as Record<string, unknown> | undefined;
	const miniProfile = from?.miniProfile as Record<string, unknown> | undefined;
	const actor = raw.actor as Record<string, unknown> | undefined;
	const actorParticipantType = actor?.participantType as Record<string, unknown> | undefined;
	const sender =
		miniProfile
			? parseMiniProfile(miniProfile)
			: actorParticipantType
				? parseParticipantType(
						actorParticipantType,
						((actor?.backendUrn as string) || (actor?.entityUrn as string) || "") as string,
					)
				: parseMiniProfile(undefined);

	return {
		messageId:
			(raw.dashEntityUrn as string) ||
			(raw.entityUrn as string) ||
			(raw.backendUrn as string) ||
			"",
		conversationId:
			conversationId ||
			(raw.backendConversationUrn as string) ||
			((raw.conversation as Record<string, unknown> | undefined)?.entityUrn as string) ||
			"",
		sender,
		body: (messageEvent?.body as string) || extractText(raw.body as TextField),
		createdAt: new Date((raw.createdAt as number) || (raw.deliveredAt as number) || 0),
		attachments:
			(messageEvent?.attachments as unknown[]) ||
			(raw.renderContent as unknown[]) ||
			[],
	};
}

/**
 * Parses a conversation element from /messaging/conversations response.
 *
 * @param raw - Raw conversation element from API
 * @returns Normalized conversation object
 */
export function parseConversation(raw: Record<string, unknown>): NormalizedConversation {
	const participantsRaw = raw.participants as Array<Record<string, unknown>> | undefined;
	const eventsRaw = raw.events as Array<Record<string, unknown>> | undefined;
	const conversationParticipantsRaw = raw.conversationParticipants as
		| Array<Record<string, unknown>>
		| undefined;
	const messagesRaw = (raw.messages as Record<string, unknown> | undefined)?.elements as
		| Array<Record<string, unknown>>
		| undefined;
	const conversationId =
		(raw.dashEntityUrn as string) ||
		(raw.backendUrn as string) ||
		(raw.entityUrn as string) ||
		"";

	const participants: NormalizedConnection[] = (participantsRaw || []).map((p) => {
		const miniProfile = p.miniProfile as Record<string, unknown> | undefined;
		return parseMiniProfile(miniProfile);
	});

	const conversationParticipants: NormalizedConnection[] = (conversationParticipantsRaw || []).map(
		(p) => {
			const participantType = p.participantType as Record<string, unknown> | undefined;
			const urn = (p.backendUrn as string) || (p.entityUrn as string) || "";
			return parseParticipantType(participantType, urn);
		},
	);

	const allParticipants = participants.length > 0 ? participants : conversationParticipants;

	// Get the first participant or create an empty one
	const participant: NormalizedConnection = allParticipants[0] ?? {
		urn: "",
		username: "",
		firstName: "",
		lastName: "",
		headline: "",
		profileUrl: LINKEDIN_PROFILE_BASE_URL,
	};

	// Extract last message body
	let lastMessage = "";
	if (eventsRaw && eventsRaw.length > 0) {
		const parsed = parseMessage(eventsRaw[0], conversationId);
		lastMessage = parsed.body;
	}
	if (!lastMessage && messagesRaw && messagesRaw.length > 0) {
		const parsed = parseMessage(messagesRaw[0], conversationId);
		lastMessage = parsed.body;
	}

	return {
		conversationId,
		participant,
		participants: allParticipants,
		lastMessage,
		lastActivityAt: new Date((raw.lastActivityAt as number) || 0),
		unreadCount: (raw.unreadCount as number) || 0,
		totalEventCount:
			(raw.totalEventCount as number) ||
			(messagesRaw ? messagesRaw.length : 0) ||
			0,
		read: (raw.read as boolean) || false,
		groupChat: (raw.groupChat as boolean) || false,
	};
}

/**
 * Parses an invitation element from /relationships/invitationViews response.
 *
 * @param raw - Raw invitation element from API
 * @returns Normalized invitation object
 */
export function parseInvitation(raw: Record<string, unknown>): NormalizedInvitation {
	const genericInviter = raw.genericInviter as Record<string, unknown> | undefined;
	const miniProfile = genericInviter?.miniProfile as Record<string, unknown> | undefined;
	const sharedConnections = raw.sharedConnections as Record<string, unknown> | undefined;
	const urn = (raw.entityUrn as string) || "";
	const message = raw.message as string | undefined;

	return {
		invitationId: extractIdFromUrn(urn),
		urn,
		sharedSecret: (raw.sharedSecret as string) || "",
		type: (raw.invitationType as string) || "",
		inviter: parseMiniProfile(miniProfile),
		...(message !== undefined && message !== null && { message }),
		sharedConnections: (sharedConnections?.count as number) || 0,
		sentAt: new Date((raw.sentTime as number) || 0),
	};
}
