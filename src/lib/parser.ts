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
	const connectionRegex =
		/"url":"(https:\/\/www\.linkedin\.com\/in\/[^"]+)"[\s\S]{0,800}?"children":\["([^"]+)"\][\s\S]{0,800}?"children":\["([^"]+)"\]/g;

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
 * Parses connections from LinkedIn search HTML payloads.
 * Falls back to miniProfile extraction when RSC stream isn't available.
 */
export function parseConnectionsFromSearchHtml(payload: string): NormalizedConnection[] {
	const normalizedPayload = payload.replace(/\\u002F/g, "/").replace(/\\\//g, "/");
	const miniProfileRegex =
		/"miniProfile":\{[\s\S]{0,800}?"publicIdentifier":"([^"]+)"[\s\S]{0,800}?"firstName":"([^"]*)"[\s\S]{0,800}?"lastName":"([^"]*)"[\s\S]{0,800}?"occupation":"([^"]*)"/g;

	const results: NormalizedConnection[] = [];
	const seen = new Set<string>();

	for (;;) {
		const match = miniProfileRegex.exec(normalizedPayload);
		if (!match) {
			break;
		}
		const username = match[1];
		const firstName = match[2] ?? "";
		const lastName = match[3] ?? "";
		const headline = match[4] ?? "";

		if (!username || seen.has(username)) {
			continue;
		}

		seen.add(username);
		results.push({
			urn: "",
			username,
			firstName,
			lastName,
			headline,
			profileUrl: `${LINKEDIN_PROFILE_BASE_URL}${username}`,
		});
	}

	return results;
}

/**
 * Parses connections from LinkedIn search RSC stream payloads.
 * Looks for "people-search-result" blocks and extracts profile URLs and names.
 */
export function parseConnectionsFromSearchStream(payload: string): NormalizedConnection[] {
	const normalizedPayload = payload.replace(/\\u002F/g, "/").replace(/\\\//g, "/");
	const marker = 'viewName":"people-search-result"';
	const results: NormalizedConnection[] = [];
	const seen = new Set<string>();

	const collectActionSlotProfileIds = (value: string): Set<string> => {
		const ids = new Set<string>();
		const actionSlotsRegex = /"actionSlots":\{[\s\S]*?\}/g;
		const slotRegex = /"([A-Za-z0-9_-]+)":"SearchResults\1"/g;
		let match: RegExpExecArray | null;
		while ((match = actionSlotsRegex.exec(value)) !== null) {
			const block = match[0];
			let slotMatch: RegExpExecArray | null;
			while ((slotMatch = slotRegex.exec(block)) !== null) {
				ids.add(slotMatch[1]);
			}
		}
		return ids;
	};

	const allowedProfileIds = collectActionSlotProfileIds(normalizedPayload);

	const decodeSearchText = (value: string): string => {
		if (!value) {
			return "";
		}
		try {
			return JSON.parse(`"${value}"`);
		} catch {
			return value.replace(/\\"/g, '"');
		}
	};

	const collectTextCandidates = (chunk: string): Array<{ raw: string; decoded: string }> => {
		const results: Array<{ raw: string; decoded: string }> = [];
		const textRegex = /"text-attr-0"[\s\S]*?"children":\["((?:\\.|[^"])*)"]/g;
		for (;;) {
			const match = textRegex.exec(chunk);
			if (!match) {
				break;
			}
			const raw = match[1] ?? "";
			const decoded = decodeSearchText(raw).trim();
			results.push({ raw, decoded });
		}

		const fallbackRegex = /"children":\["((?:\\.|[^"])*)"]/g;
		for (;;) {
			const match = fallbackRegex.exec(chunk);
			if (!match) {
				break;
			}
			const raw = match[1] ?? "";
			const decoded = decodeSearchText(raw).trim();
			results.push({ raw, decoded });
		}

		return results;
	};

	const pickBestCandidate = (candidates: Array<{ raw: string; decoded: string }>) => {
		for (const candidate of candidates) {
			const value = candidate.decoded;
			if (!value) {
				continue;
			}
			if (value.startsWith("$") || value === "$undefined") {
				continue;
			}
			if (value.startsWith("•") || value.toLowerCase().includes("connections")) {
				continue;
			}
			return candidate;
		}
		return undefined;
	};

	const isConnectionDegree = (value: string): boolean => {
		if (!value) {
			return false;
		}
		return /^•?\s*\d+(st|nd|rd|th)\+?\b/i.test(value.trim());
	};

	const normalizeDegree = (value: string): string => value.replace(/^•\s*/, "").trim();

	const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

	const extractProfileId = (chunk: string, username: string): string => {
		const escapedUsername = escapeRegex(username);
		const urlPattern = `https:\\\\/\\\\/www\\.linkedin\\.com\\\\/in\\\\/${escapedUsername}\\\\/`;
		const profileThenUrl = new RegExp(`"profileId":"([^"]+)"[\\s\\S]{0,1200}?"url":"${urlPattern}`);
		const urlThenProfile = new RegExp(`"url":"${urlPattern}"[\\s\\S]{0,1200}?"profileId":"([^"]+)"`);
		const profileThenUrlMatch = chunk.match(profileThenUrl);
		if (profileThenUrlMatch?.[1]) {
			return profileThenUrlMatch[1];
		}
		const urlThenProfileMatch = chunk.match(urlThenProfile);
		if (urlThenProfileMatch?.[1]) {
			return urlThenProfileMatch[1];
		}
		const componentKeyMatch = chunk.match(/"componentKey":"SearchResults([^"]+)"/);
		if (componentKeyMatch?.[1] && /^ACo[A-Za-z0-9_-]+$/.test(componentKeyMatch[1])) {
			return componentKeyMatch[1];
		}
		const anyProfileMatch = chunk.match(/"profileId":"([^"]+)"/);
		return anyProfileMatch?.[1] ?? "";
	};

	let index = 0;
	while (index < normalizedPayload.length) {
		const start = normalizedPayload.indexOf(marker, index);
		if (start === -1) {
			break;
		}
		const chunk = normalizedPayload.slice(start, start + 12000);
		const urlMatch = chunk.match(/"url":"https:\/\/www\.linkedin\.com\/in\/([^"\/]+)\//);
		if (!urlMatch) {
			index = start + marker.length;
			continue;
		}
		const username = urlMatch[1] ?? "";
		if (!username || seen.has(username)) {
			index = start + marker.length;
			continue;
		}
		const profileId = extractProfileId(chunk, username);
		if (allowedProfileIds.size > 0 && (!profileId || !allowedProfileIds.has(profileId))) {
			index = start + marker.length;
			continue;
		}

		let name = "";
		let rawName = "";
		const titleIndex = chunk.indexOf("search-result-lockup-title");
		if (titleIndex !== -1) {
			const titleChunk = chunk.slice(titleIndex, titleIndex + 7000);
			const candidate = pickBestCandidate(collectTextCandidates(titleChunk));
			if (candidate) {
				name = candidate.decoded;
				rawName = candidate.raw;
			}
		}

		if (!name) {
			const candidate = pickBestCandidate(collectTextCandidates(chunk));
			if (candidate) {
				name = candidate.decoded;
				rawName = candidate.raw;
			}
		}

		const nameParts = name.trim().split(/\s+/);
		const firstName = nameParts[0] ?? "";
		const lastName = nameParts.slice(1).join(" ");

		const socialProofIndex = chunk.indexOf("search-result-social-proof-insight", titleIndex);
		const headlineChunk =
			titleIndex !== -1
				? chunk.slice(titleIndex, socialProofIndex === -1 ? titleIndex + 8000 : socialProofIndex)
				: chunk;
		const headlineCandidates = collectTextCandidates(headlineChunk).filter(
			(candidate) =>
				candidate.decoded &&
				!candidate.decoded.startsWith("$") &&
				candidate.decoded !== "$undefined",
		);

		const nameIndex = headlineCandidates.findIndex((candidate) => candidate.decoded === name);
		const degreeCandidate = headlineCandidates.find((candidate) =>
			isConnectionDegree(candidate.decoded),
		);
		const connectionDegree = degreeCandidate ? normalizeDegree(degreeCandidate.decoded) : "";

		let headline = "";
		const startIndex = nameIndex >= 0 ? nameIndex + 1 : 0;
		for (let i = startIndex; i < headlineCandidates.length; i += 1) {
			const value = headlineCandidates[i]?.decoded ?? "";
			if (!value || value === name) {
				continue;
			}
			if (isConnectionDegree(value)) {
				continue;
			}
			if (value.startsWith("•") || /connections|followers|mutual/i.test(value)) {
				continue;
			}
			headline = value;
			break;
		}

		seen.add(username);
		results.push({
			urn: profileId ? `urn:li:fsd_profile:${profileId}` : "",
			username,
			firstName,
			lastName,
			headline,
			profileUrl: `${LINKEDIN_PROFILE_BASE_URL}${username}`,
			...(connectionDegree ? { connectionDegree } : {}),
		});

		index = start + marker.length;
	}

	return results;
}

/**
 * Parses invitations from LinkedIn flagship-web RSC payloads.
 * These payloads are not JSON and require regex extraction.
 */
export function parseInvitationsFromFlagshipRsc(payload: string): NormalizedInvitation[] {
	const invitationRegex =
		/"entityUrn":"(urn:li:fsd_invitation:[^"]+)"[\s\S]{0,4000}?"sharedSecret":"([^"]*)"[\s\S]{0,4000}?"invitationType":"([^"]+)"[\s\S]{0,4000}?"sentTime":(\d+)[\s\S]{0,4000}?"sharedConnections":\{"count":(\d+)\}[\s\S]{0,4000}?"miniProfile":\{([\s\S]{0,2000}?)\}/g;

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

	if (results.length > 0) {
		return results;
	}

	const fallbackInvites = parseInvitationsFromFlagshipRscFallback(payload);
	return fallbackInvites;
}

function parseInvitationsFromFlagshipRscFallback(payload: string): NormalizedInvitation[] {
	const invitationRegex = /"componentKey":"(urn:li:invitation:[^"]+)"/g;
	const results: NormalizedInvitation[] = [];
	const seen = new Set<string>();

	for (;;) {
		const match = invitationRegex.exec(payload);
		if (!match) {
			break;
		}
		const urn = match[1] ?? "";
		if (!urn || seen.has(urn)) {
			continue;
		}

		const nextIndex = payload.indexOf('"componentKey":"urn:li:invitation:', match.index + 1);
		const chunk = payload.slice(match.index, nextIndex === -1 ? payload.length : nextIndex);

		const usernameMatch = chunk.match(/https:\/\/www\.linkedin\.com\/in\/([^/?"]+)/);
		const nameMatch = parseInviteName(chunk);
		const profileIdMatch = chunk.match(/"profileId":"([^"]+)"/);
		const invitationTypeMatch = chunk.match(/"invitationType":"([^"]+)"/);
		const sharedSecretMatch = chunk.match(/"validationToken":"([^"]+)"/);

		const messageMatch = chunk.match(/"message":"([^"]+)"/);
		const headline = pickInviteHeadline(chunk);
		const sharedConnections = parseSharedConnections(chunk);
		const sentAt = parseInvitationTime(chunk);

		const rawInvitation: Record<string, unknown> = {
			entityUrn: urn,
			sharedSecret: sharedSecretMatch?.[1] ?? "",
			invitationType: invitationTypeMatch?.[1] ?? "",
			sentTime: sentAt.getTime(),
			sharedConnections: { count: sharedConnections },
			genericInviter: {
				miniProfile: {
					publicIdentifier: usernameMatch?.[1] ?? "",
					firstName: nameMatch.firstName,
					lastName: nameMatch.lastName,
					occupation: headline,
					entityUrn: profileIdMatch?.[1] ? `urn:li:fsd_profile:${profileIdMatch[1]}` : "",
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

function parseInviteName(chunk: string): { firstName: string; lastName: string } {
	const textMatch = chunk.match(/"children":\["([^"]+)"\]/);
	if (textMatch?.[1]) {
		const raw = textMatch[1];
		const namePart = raw.split(",")[0]?.trim() ?? "";
		const parts = namePart.split(/\s+/).filter(Boolean);
		if (parts.length > 0) {
			return {
				firstName: parts[0] ?? "",
				lastName: parts.slice(1).join(" "),
			};
		}
	}
	return { firstName: "", lastName: "" };
}

function pickInviteHeadline(chunk: string): string {
	const candidates = Array.from(chunk.matchAll(/"children":\["([^"]+)"\]/g)).map(
		(match) => match[1] ?? "",
	);
	for (const candidate of candidates) {
		const text = candidate.trim();
		if (text.length < 5 || text.length > 200) {
			continue;
		}
		if (
			text.includes("inviting you to connect") ||
			text.includes("mutual connection") ||
			text === "Yesterday" ||
			text === "Today" ||
			text.startsWith("Invitation") ||
			text === "Message"
		) {
			continue;
		}
		return text;
	}
	return "";
}

function parseSharedConnections(chunk: string): number {
	const otherMatch = chunk.match(/(\d+)\s+other mutual connection/);
	if (otherMatch?.[1]) {
		return Number(otherMatch[1]) + 1;
	}
	const mutualMatch = chunk.match(/(\d+)\s+mutual connections?/);
	if (mutualMatch?.[1]) {
		return Number(mutualMatch[1]);
	}
	return 0;
}

function parseInvitationTime(chunk: string): Date {
	const candidates = Array.from(chunk.matchAll(/"children":\["([^"]+)"\]/g)).map(
		(match) => match[1] ?? "",
	);
	for (const candidate of candidates) {
		const parsed = parseRelativeTimeText(candidate.trim());
		if (parsed) {
			return parsed;
		}
	}
	return new Date(0);
}

function parseRelativeTimeText(text: string): Date | null {
	const now = new Date();
	const lower = text.toLowerCase();
	if (lower === "yesterday") {
		return new Date(now.getTime() - 24 * 60 * 60 * 1000);
	}
	if (lower === "today") {
		return now;
	}
	const match = lower.match(/(\d+)\s+(minute|minutes|hour|hours|day|days|week|weeks)\s+ago/);
	if (!match) {
		return null;
	}
	const value = Number(match[1] ?? 0);
	const unit = match[2] ?? "";
	if (!Number.isFinite(value) || value <= 0) {
		return null;
	}
	switch (unit) {
		case "minute":
		case "minutes":
			return new Date(now.getTime() - value * 60 * 1000);
		case "hour":
		case "hours":
			return new Date(now.getTime() - value * 60 * 60 * 1000);
		case "day":
		case "days":
			return new Date(now.getTime() - value * 24 * 60 * 60 * 1000);
		case "week":
		case "weeks":
			return new Date(now.getTime() - value * 7 * 24 * 60 * 60 * 1000);
		default:
			return null;
	}
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
	const sender = miniProfile
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
		attachments: (messageEvent?.attachments as unknown[]) || (raw.renderContent as unknown[]) || [],
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
		(raw.dashEntityUrn as string) || (raw.backendUrn as string) || (raw.entityUrn as string) || "";

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
		totalEventCount: (raw.totalEventCount as number) || (messagesRaw ? messagesRaw.length : 0) || 0,
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
