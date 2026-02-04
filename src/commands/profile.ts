/**
 * Profile command - view a LinkedIn profile.
 *
 * Supports various input formats:
 * - Plain username: "peggyrayzis"
 * - Profile URL: "https://linkedin.com/in/peggyrayzis"
 * - Profile URN: "urn:li:fsd_profile:ABC123"
 */

import type { LinkedInCredentials } from "../lib/auth.js";
import { LinkedInApiError, LinkedInClient } from "../lib/client.js";
import { LINKEDIN_PROFILE_BASE_URL, LINKEDIN_PROFILE_DECORATION_ID } from "../lib/constants.js";
import endpoints from "../lib/endpoints.json" with { type: "json" };
import { parseMeResponse, type MeResponse } from "../lib/me.js";
import { parseProfile } from "../lib/parser.js";
import type { NormalizedProfile } from "../lib/types.js";
import { resolveRecipient } from "../lib/recipient.js";
import { parseLinkedInUrl } from "../lib/url-parser.js";
import { formatProfile } from "../output/human.js";
import { formatJson } from "../output/json.js";

export interface ProfileOptions {
	json?: boolean;
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

function isSelfProfile(
	resolved: { username: string; urn: string },
	meProfile: NormalizedProfile,
): boolean {
	if (resolved.username && meProfile.username && resolved.username === meProfile.username) {
		return true;
	}
	const resolvedUrn = normalizeProfileUrn(resolved.urn);
	const meUrn = normalizeProfileUrn(meProfile.urn);
	return Boolean(resolvedUrn && meUrn && resolvedUrn === meUrn);
}

/**
 * Fetch and display a LinkedIn profile.
 *
 * @param credentials - LinkedIn session credentials
 * @param identifier - Username, profile URL, or URN
 * @param options - Command options (--json flag)
 * @returns Formatted profile output
 */
export async function profile(
	credentials: LinkedInCredentials,
	identifier: string,
	options: ProfileOptions = {},
): Promise<string> {
	// Validate input
	if (!identifier || identifier.trim() === "") {
		throw new Error("Invalid profile identifier. Provide a username, profile URL, or URN.");
	}

	const client = new LinkedInClient(credentials);

	// Parse the identifier to determine type for validation
	const parsed = parseLinkedInUrl(identifier);
	if (parsed?.type !== "profile") {
		throw new Error("Invalid profile identifier. Provide a username, profile URL, or URN.");
	}

	const resolved = await resolveRecipient(client, identifier);
	const encodedUrn = encodeURIComponent(resolved.urn);
	const endpoint = `/identity/dash/profiles/${encodedUrn}?decorationId=${LINKEDIN_PROFILE_DECORATION_ID}`;

	// Fetch the profile from the dash endpoint
	let rawData: Record<string, unknown>;
	try {
		const response = await client.request(endpoint);
		rawData = (await response.json()) as Record<string, unknown>;
	} catch (error) {
		if (error instanceof LinkedInApiError && error.status === 403) {
			try {
				const meResponse = await client.request(endpoints.endpoints.me);
				const meData = (await meResponse.json()) as MeResponse;
				const meProfile = parseMeResponse(meData);
				if (isSelfProfile(resolved, meProfile)) {
					if (options.json) {
						return formatJson(meProfile);
					}
					return formatProfile(meProfile);
				}
			} catch {
				// Fall through to rethrow the original error.
			}
		}
		throw error;
	}

	// Parse the response
	let normalizedProfile = parseProfile(rawData);

	const hasIdentity = Boolean(
		normalizedProfile.username || normalizedProfile.firstName || normalizedProfile.lastName,
	);
	if (!hasIdentity && resolved.username) {
		try {
			const profileEndpoint = endpoints.endpoints.profile.replace(
				"{username}",
				encodeURIComponent(resolved.username),
			);
			const fallbackResponse = await client.request(profileEndpoint);
			const fallbackData = (await fallbackResponse.json()) as Record<string, unknown>;
			const fallbackProfile = parseProfile(fallbackData);
			normalizedProfile = {
				...fallbackProfile,
				urn: fallbackProfile.urn || normalizedProfile.urn || resolved.urn,
				username: fallbackProfile.username || normalizedProfile.username,
				firstName: fallbackProfile.firstName || normalizedProfile.firstName,
				lastName: fallbackProfile.lastName || normalizedProfile.lastName,
				headline: fallbackProfile.headline || normalizedProfile.headline,
				location: fallbackProfile.location || normalizedProfile.location,
				...(fallbackProfile.industry || normalizedProfile.industry
					? { industry: fallbackProfile.industry || normalizedProfile.industry }
					: {}),
				...(fallbackProfile.summary || normalizedProfile.summary
					? { summary: fallbackProfile.summary || normalizedProfile.summary }
					: {}),
			};
		} catch {
			// Ignore fallback errors and use the original profile data.
		}
	}

	const normalizedUsername = normalizedProfile.username || resolved.username;
	const normalizedUrn = normalizedProfile.urn || resolved.urn;

	// Add profile URL for display
	const profileWithUrl = {
		...normalizedProfile,
		username: normalizedUsername,
		urn: normalizedUrn,
		profileUrl: `${LINKEDIN_PROFILE_BASE_URL}${normalizedUsername}`,
	};

	// Format output based on options
	if (options.json) {
		return formatJson(profileWithUrl);
	}

	return formatProfile(profileWithUrl);
}
