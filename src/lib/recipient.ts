/**
 * Recipient resolution utility.
 *
 * Resolves various LinkedIn identifier formats to profile URNs:
 * - Plain username: "peggyrayzis"
 * - Profile URL: "https://linkedin.com/in/peggyrayzis"
 * - Profile URN: "urn:li:fsd_profile:ABC123"
 */

import type { LinkedInClient } from "./client.js";
import { parseLinkedInUrl } from "./url-parser.js";

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

	// Handle non-LinkedIn URLs (returns null)
	if (parsed === null) {
		throw new Error(`Invalid input: ${identifier} is not a valid LinkedIn profile`);
	}

	// Handle non-profile types
	if (parsed.type !== "profile") {
		throw new Error(`Invalid input: cannot resolve ${parsed.type} URL to a profile`);
	}

	// If it's already a URN, look up the profile to get the username
	if (parsed.identifier.startsWith("urn:li:")) {
		return lookupProfileByUrn(client, parsed.identifier);
	}

	// It's a username, look up to get the URN
	return lookupProfileByUsername(client, parsed.identifier);
}

/**
 * Look up a profile by URN to get both URN and username.
 */
async function lookupProfileByUrn(client: LinkedInClient, urn: string): Promise<ResolvedRecipient> {
	const response = await client.request(
		`/identity/dash/profiles?q=memberIdentity&memberIdentity=${encodeURIComponent(urn)}`,
		{ method: "GET" },
	);
	const data = (await response.json()) as ProfileLookupResponse;

	if (!data.elements || data.elements.length === 0) {
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
