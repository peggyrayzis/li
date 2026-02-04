/**
 * Recipient resolution utility.
 *
 * Resolves various LinkedIn identifier formats to profile URNs:
 * - Plain username: "peggyrayzis"
 * - Profile URL: "https://linkedin.com/in/peggyrayzis"
 * - Profile URN: "urn:li:fsd_profile:ABC123"
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { LinkedInApiError, type LinkedInClient } from "./client.js";
import endpoints from "./endpoints.json" with { type: "json" };
import { buildWebHeaders } from "./headers.js";
import { parseProfile } from "./parser.js";
import { parseLinkedInUrl } from "./url-parser.js";

const DEBUG_RECIPIENT =
	process.env.LI_DEBUG_RECIPIENT === "1" || process.env.LI_DEBUG_RECIPIENT === "true";
const RECIPIENT_CACHE_PATH =
	process.env.LI_RECIPIENT_CACHE_PATH ??
	path.join(os.tmpdir(), "li-recipient-cache.json");

function isProfileViewEnabled(): boolean {
	return (
		process.env.LI_ENABLE_PROFILEVIEW === "1" ||
		process.env.LI_ENABLE_PROFILEVIEW === "true"
	);
}

function debugRecipient(message: string): void {
	if (!DEBUG_RECIPIENT) {
		return;
	}
	process.stderr.write(`[li][recipient] ${message}\n`);
}

type RecipientCache = Record<string, { urn: string; updatedAt: number }>;

function loadRecipientCache(): RecipientCache {
	try {
		const raw = readFileSync(RECIPIENT_CACHE_PATH, "utf8");
		const parsed = JSON.parse(raw) as RecipientCache;
		if (!parsed || typeof parsed !== "object") {
			return {};
		}
		return parsed;
	} catch {
		return {};
	}
}

function saveRecipientCache(cache: RecipientCache): void {
	try {
		mkdirSync(path.dirname(RECIPIENT_CACHE_PATH), { recursive: true });
		writeFileSync(RECIPIENT_CACHE_PATH, JSON.stringify(cache), "utf8");
	} catch {
		// Best-effort cache; ignore failures.
	}
}

function warnIfRecipientChanged(key: string, currentUrn: string): void {
	if (!key || !currentUrn) {
		return;
	}
	const cache = loadRecipientCache();
	const previous = cache[key]?.urn ?? "";
	if (previous && previous !== currentUrn) {
		process.stderr.write(
			`[li][recipient] warning=profile_urn_changed key=${key} prev=${previous} next=${currentUrn}\n`,
		);
	}
	cache[key] = { urn: currentUrn, updatedAt: Date.now() };
	saveRecipientCache(cache);
}

/**
 * Result of resolving a recipient identifier.
 */
export interface ResolvedRecipient {
	/** The public username (e.g., "peggyrayzis") */
	username: string;
	/** The profile URN (e.g., "urn:li:fsd_profile:ACoAABcd1234") */
	urn: string;
}

/**
 * Response from the profile lookup API.
 */
interface ProfileLookupResponse {
	elements?: Array<{
		entityUrn: string;
		publicIdentifier?: string;
	}> | null;
}

interface MeResponse {
	miniProfile?: {
		publicIdentifier?: string;
		objectUrn?: string;
		entityUrn?: string;
		dashEntityUrn?: string;
	};
	data?: {
		"*miniProfile"?: string;
	};
	included?: Array<{
		publicIdentifier?: string;
		objectUrn?: string;
		entityUrn?: string;
		dashEntityUrn?: string;
	}> | null;
}

/**
 * Resolve a recipient identifier to a profile URN.
 *
 * Accepts multiple input formats:
 * - Plain username: "peggyrayzis"
 * - Profile URL: "https://www.linkedin.com/in/peggyrayzis"
 * - Profile URN: "urn:li:fsd_profile:ACoAABcd1234" or "urn:li:member:123456789"
 *
 * @param client - LinkedIn API client for making requests
 * @param identifier - Username, profile URL, or profile URN
 * @returns Resolved recipient with username and URN
 * @throws Error if the identifier is invalid or profile not found
 *
 * @example
 * const recipient = await resolveRecipient(client, "peggyrayzis");
 * // { username: "peggyrayzis", urn: "urn:li:fsd_profile:ACoAABcd1234" }
 *
 * @example
 * const recipient = await resolveRecipient(client, "https://linkedin.com/in/peggyrayzis");
 * // { username: "peggyrayzis", urn: "urn:li:fsd_profile:ACoAABcd1234" }
 */
export async function resolveRecipient(
	client: LinkedInClient,
	identifier: string,
): Promise<ResolvedRecipient> {
	const trimmed = identifier.trim();

	if (!trimmed) {
		throw new Error("Invalid input: identifier is required");
	}

	// Parse the input to determine type
	const parsed = parseLinkedInUrl(trimmed);
	debugRecipient(`input=${trimmed} parsed=${parsed?.type ?? "null"}`);

	// Handle non-LinkedIn URLs (returns null)
	if (parsed === null) {
		throw new Error(`Invalid input: ${identifier} is not a valid LinkedIn profile`);
	}

	// Handle non-profile types
	if (parsed.type !== "profile") {
		throw new Error(`Invalid input: cannot resolve ${parsed.type} URL to a profile`);
	}

	// If it's already a URN, look up the profile to get the username
	const resolved = parsed.identifier.startsWith("urn:li:")
		? await lookupProfileByUrn(client, parsed.identifier)
		: await lookupProfileByUsername(client, parsed.identifier);

	warnIfRecipientChanged(resolved.username || parsed.identifier, resolved.urn);
	return resolved;
}

/**
 * Look up a profile by URN to get both URN and username.
 */
async function lookupProfileByUrn(client: LinkedInClient, urn: string): Promise<ResolvedRecipient> {
	debugRecipient(`lookupProfileByUrn urn=${urn}`);
	const response = await client.request(
		`/identity/dash/profiles?q=memberIdentity&memberIdentity=${encodeURIComponent(urn)}`,
		{ method: "GET" },
	);
	const data = (await response.json()) as ProfileLookupResponse;

	if (!data.elements || data.elements.length === 0) {
		debugRecipient(`lookupProfileByUrn not found urn=${urn}`);
		throw new Error(`Profile not found for URN: ${urn}`);
	}

	return {
		username: data.elements[0].publicIdentifier ?? "",
		urn: data.elements[0].entityUrn,
	};
}

/**
 * Look up a profile by username to get both URN and username.
 */
async function lookupProfileByUsername(
	client: LinkedInClient,
	username: string,
): Promise<ResolvedRecipient> {
	debugRecipient(`lookupProfileByUsername username=${username}`);
	let data: ProfileLookupResponse = {};
	let dashLookupError: LinkedInApiError | null = null;
	try {
		const response = await client.request(
			`/identity/dash/profiles?q=memberIdentity&memberIdentity=${encodeURIComponent(username)}`,
			{ method: "GET" },
		);
		data = (await response.json()) as ProfileLookupResponse;
	} catch (error) {
		if (error instanceof LinkedInApiError && error.status === 403) {
			dashLookupError = error;
			debugRecipient(`dash lookup forbidden username=${username}`);
			data = { elements: [] };
		} else {
			throw error;
		}
	}

	if (!data.elements || data.elements.length === 0) {
		debugRecipient(`dash lookup empty username=${username}`);
		if (isProfileViewEnabled()) {
			const fallback = await lookupProfileByUsernameView(client, username);
			if (fallback) {
				return fallback;
			}
		} else {
			debugRecipient(`profileView skipped username=${username}`);
		}

		const htmlFallback = await lookupProfileByHtml(client, username);
		if (htmlFallback) {
			return htmlFallback;
		}

		debugRecipient(`falling back to /me username=${username}`);
		const meResponse = await client.request("/me", { method: "GET" });
		const meData = (await meResponse.json()) as MeResponse;
		const meMini =
			meData.miniProfile ??
			meData.included?.find((item) => item.publicIdentifier) ??
			(meData.included && meData.included.length > 0 ? meData.included[0] : undefined);
		const meUsername = meMini?.publicIdentifier ?? "";
		const meProfileUrn = normalizeProfileUrn(meMini?.entityUrn ?? meMini?.dashEntityUrn ?? "");
		const meMemberUrn = meMini?.objectUrn ?? "";

		if (meUsername === username) {
			if (meProfileUrn) {
				return { username: meUsername, urn: meProfileUrn };
			}
			if (meMemberUrn) {
				return lookupProfileByUrn(client, meMemberUrn);
			}
		}

		if (dashLookupError) {
			throw dashLookupError;
		}
		throw new Error(`Profile not found: ${username}`);
	}

	return {
		username: data.elements[0].publicIdentifier ?? username,
		urn: data.elements[0].entityUrn,
	};
}

async function lookupProfileByUsernameView(
	client: LinkedInClient,
	username: string,
): Promise<ResolvedRecipient | null> {
	try {
		const endpoint = endpoints.endpoints.profile.replace(
			"{username}",
			encodeURIComponent(username),
		);
		const response = await client.request(endpoint, { method: "GET" });
		debugRecipient(`profileView status=${response.status} username=${username}`);
		const rawData = (await response.json()) as Record<string, unknown>;
		const profile = parseProfile(rawData);
		if (!profile.urn) {
			return null;
		}
		return {
			username: profile.username || username,
			urn: profile.urn,
		};
	} catch {
		return null;
	}
}

async function lookupProfileByHtml(
	client: LinkedInClient,
	username: string,
): Promise<ResolvedRecipient | null> {
	try {
		const credentials = client.getCredentials();
		const url = `https://www.linkedin.com/in/${encodeURIComponent(username)}/`;
		let response = await client.requestAbsolute(url, {
			method: "GET",
			headers: buildWebHeaders(credentials),
		});
		debugRecipient(`profileHtml status=${response.status} username=${username}`);

		if (response.status === 302) {
			const location = response.headers?.get?.("location") ?? "";
			if (location) {
				const nextUrl = location.startsWith("http")
					? location
					: `https://www.linkedin.com${location}`;
				debugRecipient(`profileHtml redirect=${nextUrl}`);
				response = await client.requestAbsolute(nextUrl, {
					method: "GET",
					headers: buildWebHeaders(credentials),
				});
				debugRecipient(`profileHtml redirectStatus=${response.status} username=${username}`);
			}
		}

		if (!response.ok) {
			return null;
		}
		const html = await response.text();
		const decoded = html.replace(/\\u002F/g, "/");
		const entityDecoded = decoded
			.replace(/&quot;|&#34;|&#x22;/g, '"')
			.replace(/&amp;/g, "&");
		const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const escapedUsername = escapeRegex(username);
		const idNearPublicIdentifier =
			entityDecoded.match(
				new RegExp(
					`"publicIdentifier":"${escapedUsername}"[\\s\\S]{0,1200}?"profileId":"(ACo[A-Za-z0-9_-]+)"`,
				),
			)?.[1] ??
			entityDecoded.match(
				new RegExp(
					`"profileId":"(ACo[A-Za-z0-9_-]+)"[\\s\\S]{0,1200}?"publicIdentifier":"${escapedUsername}"`,
				),
			)?.[1] ??
			"";
		const urnNearPublicIdentifierMatch =
			entityDecoded.match(
				new RegExp(
					`"publicIdentifier":"${escapedUsername}"[\\s\\S]{0,1200}?(urn:li:(?:fsd_profile|fs_miniProfile):ACo[A-Za-z0-9_-]+)`,
				),
			)?.[1] ??
			entityDecoded.match(
				new RegExp(
					`(urn:li:(?:fsd_profile|fs_miniProfile):ACo[A-Za-z0-9_-]+)[\\s\\S]{0,1200}?"publicIdentifier":"${escapedUsername}"`,
				),
			)?.[1] ??
			"";

		const isValidProfileUrn = (value: string): boolean =>
			/^urn:li:fsd_profile:ACo[A-Za-z0-9_-]+$/.test(value);
		const isValidMemberUrn = (value: string): boolean => /^urn:li:member:\d+$/.test(value);

		const profileUrnMatches =
			entityDecoded.match(/urn:li:(?:fsd_profile|fs_miniProfile):ACo[A-Za-z0-9_-]+/g) ?? [];
		const normalizedProfileUrns = profileUrnMatches
			.map((value) => normalizeProfileUrn(value))
			.filter(isValidProfileUrn);
		const profileIdMatch = entityDecoded.match(/"profileId":"(ACo[A-Za-z0-9_-]+)"/);
		const memberUrnMatches = entityDecoded.match(/urn:li:member:\d+/g) ?? [];
		const normalizedMemberUrns = memberUrnMatches.filter(isValidMemberUrn);
		const longestProfileUrn =
			normalizedProfileUrns.length > 0
				? normalizedProfileUrns.sort((a, b) => b.length - a.length)[0]
				: undefined;
		const longestMemberUrn =
			normalizedMemberUrns.length > 0
				? normalizedMemberUrns.sort((a, b) => b.length - a.length)[0]
				: undefined;
		const publicIdentifierMatch = entityDecoded.match(
			new RegExp(`"publicIdentifier":"(${escapedUsername})"`),
		);
		const fallbackPublicIdentifierMatch = entityDecoded.match(/"publicIdentifier":"([^"]+)"/);
		const preferredProfileUrn = urnNearPublicIdentifierMatch
			? normalizeProfileUrn(urnNearPublicIdentifierMatch)
			: "";
		const urn =
			(idNearPublicIdentifier ? `urn:li:fsd_profile:${idNearPublicIdentifier}` : undefined) ??
			(preferredProfileUrn && isValidProfileUrn(preferredProfileUrn)
				? preferredProfileUrn
				: undefined) ??
			(profileIdMatch ? `urn:li:fsd_profile:${profileIdMatch[1]}` : undefined) ??
			longestProfileUrn ??
			longestMemberUrn ??
			"";
		if (!urn) {
			debugRecipient(`profileHtml urn not found username=${username}`);
			return null;
		}

		debugRecipient(`profileHtml urn=${urn} username=${username}`);
		if (idNearPublicIdentifier || preferredProfileUrn) {
			debugRecipient(`profileHtml matched publicIdentifier username=${username}`);
		}

		if (urn.startsWith("urn:li:member:")) {
			try {
				return await lookupProfileByUrn(client, urn);
			} catch {
				// Fall through to return the member urn if lookup fails.
			}
		}

		return {
			username:
				publicIdentifierMatch?.[1] ??
				fallbackPublicIdentifierMatch?.[1] ??
				username,
			urn,
		};
	} catch {
		return null;
	}
}

function normalizeProfileUrn(urn: string): string {
	if (!urn) {
		return "";
	}
	if (urn.startsWith("urn:li:fs_miniProfile:")) {
		return urn.replace("urn:li:fs_miniProfile:", "urn:li:fsd_profile:");
	}
	return urn;
}
