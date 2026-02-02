/**
 * Parser for LinkedIn Voyager API responses.
 * Normalizes raw API responses into clean, typed objects.
 */

/**
 * Normalized profile data from Voyager API.
 */
export interface NormalizedProfile {
	firstName: string;
	lastName: string;
	name: string;
	headline: string;
	username: string;
	urn: string;
	location: string;
	industry: string;
	summary: string;
}

/**
 * Normalized connection data from /relationships/dash/connections endpoint.
 */
export interface NormalizedConnection {
	firstName: string;
	lastName: string;
	name: string;
	username: string;
	headline: string;
	urn: string;
}

/**
 * Participant in a conversation.
 */
export interface ConversationParticipant {
	username: string;
	name: string;
	headline: string;
}

/**
 * Normalized conversation data from /messaging/conversations endpoint.
 */
export interface NormalizedConversation {
	urn: string;
	read: boolean;
	unreadCount: number;
	totalEventCount: number;
	groupChat: boolean;
	participants: ConversationParticipant[];
	lastMessage: NormalizedMessage | null;
	lastActivityAt: Date;
}

/**
 * Normalized message data from conversation events.
 */
export interface NormalizedMessage {
	body: string;
	senderUsername: string;
	timestamp: Date;
	attachments: unknown[];
}

/**
 * Inviter profile info in an invitation.
 */
export interface InviterProfile {
	username: string;
	name: string;
	headline: string;
}

/**
 * Normalized invitation data from /relationships/invitationViews endpoint.
 */
export interface NormalizedInvitation {
	urn: string;
	sharedSecret: string;
	type: string;
	inviter: InviterProfile;
	message: string | null;
	sharedConnectionsCount: number;
	sentTime: Date;
}

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
 * Parses a raw profile response from Voyager API.
 * Works with both /identity/profiles/{slug}/profileView and /identity/dash/profiles responses.
 *
 * @param raw - Raw profile data from API
 * @returns Normalized profile object
 */
export function parseProfile(raw: Record<string, unknown>): NormalizedProfile {
	const firstName = extractLocalized(raw.firstName as LocalizedField);
	const lastName = extractLocalized(raw.lastName as LocalizedField);

	return {
		firstName,
		lastName,
		name: `${firstName} ${lastName}`.trim(),
		headline: extractLocalized(raw.headline as LocalizedField),
		username: (raw.publicIdentifier as string) || "",
		urn: (raw.entityUrn as string) || "",
		location: extractLocalized(raw.locationName as LocalizedField),
		industry: extractLocalized(raw.industryName as LocalizedField),
		summary: extractLocalized(raw.summary as LocalizedField),
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
			firstName: "",
			lastName: "",
			name: "",
			username: "",
			headline: "",
			urn,
		};
	}

	const firstName = extractLocalized(profile.firstName as LocalizedField);
	const lastName = extractLocalized(profile.lastName as LocalizedField);

	return {
		firstName,
		lastName,
		name: `${firstName} ${lastName}`.trim(),
		username: (profile.publicIdentifier as string) || "",
		headline: extractLocalized(profile.headline as LocalizedField),
		urn,
	};
}

/**
 * Parses a message event from conversation events array.
 *
 * @param raw - Raw message event from API
 * @returns Normalized message object
 */
export function parseMessage(raw: Record<string, unknown>): NormalizedMessage {
	const eventContent = raw.eventContent as Record<string, unknown> | undefined;
	const messageEvent = eventContent?.messageEvent as Record<string, unknown> | undefined;
	const from = raw.from as Record<string, unknown> | undefined;
	const miniProfile = from?.miniProfile as Record<string, unknown> | undefined;

	return {
		body: (messageEvent?.body as string) || "",
		senderUsername: (miniProfile?.publicIdentifier as string) || "",
		timestamp: new Date((raw.createdAt as number) || 0),
		attachments: (messageEvent?.attachments as unknown[]) || [],
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

	const participants: ConversationParticipant[] = (participantsRaw || []).map((p) => {
		const miniProfile = p.miniProfile as Record<string, unknown> | undefined;
		const firstName = (miniProfile?.firstName as string) || "";
		const lastName = (miniProfile?.lastName as string) || "";

		return {
			username: (miniProfile?.publicIdentifier as string) || "",
			name: `${firstName} ${lastName}`.trim(),
			headline: (miniProfile?.occupation as string) || "",
		};
	});

	let lastMessage: NormalizedMessage | null = null;
	if (eventsRaw && eventsRaw.length > 0) {
		lastMessage = parseMessage(eventsRaw[0]);
	}

	return {
		urn: (raw.dashEntityUrn as string) || "",
		read: (raw.read as boolean) || false,
		unreadCount: (raw.unreadCount as number) || 0,
		totalEventCount: (raw.totalEventCount as number) || 0,
		groupChat: (raw.groupChat as boolean) || false,
		participants,
		lastMessage,
		lastActivityAt: new Date((raw.lastActivityAt as number) || 0),
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

	const firstName = (miniProfile?.firstName as string) || "";
	const lastName = (miniProfile?.lastName as string) || "";

	const inviter: InviterProfile = {
		username: (miniProfile?.publicIdentifier as string) || "",
		name: `${firstName} ${lastName}`.trim(),
		headline: (miniProfile?.occupation as string) || "",
	};

	return {
		urn: (raw.entityUrn as string) || "",
		sharedSecret: (raw.sharedSecret as string) || "",
		type: (raw.invitationType as string) || "",
		inviter,
		message: (raw.message as string) ?? null,
		sharedConnectionsCount: (sharedConnections?.count as number) || 0,
		sentTime: new Date((raw.sentTime as number) || 0),
	};
}
