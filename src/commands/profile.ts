/**
 * Profile command - view a LinkedIn profile.
 *
 * Supports various input formats:
 * - Plain username: "peggyrayzis"
 * - Profile URL: "https://linkedin.com/in/peggyrayzis"
 * - Profile URN: "urn:li:fsd_profile:ABC123"
 */

import type { LinkedInCredentials } from "../lib/auth.js";
import { LinkedInClient } from "../lib/client.js";
import {
	LINKEDIN_PROFILE_BASE_URL,
	LINKEDIN_PROFILE_DECORATION_ID,
} from "../lib/constants.js";
import { parseProfile } from "../lib/parser.js";
import { resolveRecipient } from "../lib/recipient.js";
import { parseLinkedInUrl } from "../lib/url-parser.js";
import { formatProfile } from "../output/human.js";
import { formatJson } from "../output/json.js";

export interface ProfileOptions {
	json?: boolean;
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
	const response = await client.request(endpoint);
	const rawData = (await response.json()) as Record<string, unknown>;

	// Parse the response
	const normalizedProfile = parseProfile(rawData);
	const normalizedUsername = normalizedProfile.username || resolved.username;

	// Add profile URL for display
	const profileWithUrl = {
		...normalizedProfile,
		username: normalizedUsername,
		profileUrl: `${LINKEDIN_PROFILE_BASE_URL}${normalizedUsername}`,
	};

	// Format output based on options
	if (options.json) {
		return formatJson(profileWithUrl);
	}

	return formatProfile(profileWithUrl);
}
