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
import { LINKEDIN_PROFILE_BASE_URL } from "../lib/constants.js";
import endpoints from "../lib/endpoints.json" with { type: "json" };
import { parseProfile } from "../lib/parser.js";
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

	// Parse the identifier to determine type
	const parsed = parseLinkedInUrl(identifier);

	let endpoint: string;

	if (parsed?.type === "profile") {
		// Check if it's a URN or username
		if (parsed.identifier.startsWith("urn:li:")) {
			// Use the profileByUrn endpoint for URN lookups
			endpoint = endpoints.endpoints.profileByUrn.replace("{username}", parsed.identifier);
		} else {
			// Use standard profile endpoint for username
			endpoint = endpoints.endpoints.profile.replace("{username}", parsed.identifier);
		}
	} else {
		// Treat as plain username
		endpoint = endpoints.endpoints.profile.replace("{username}", identifier.trim());
	}

	// Fetch the profile
	const response = await client.request(endpoint);
	const rawData = (await response.json()) as Record<string, unknown>;

	// Parse the response
	const normalizedProfile = parseProfile(rawData);

	// Add profile URL for display
	const profileWithUrl = {
		...normalizedProfile,
		profileUrl: `${LINKEDIN_PROFILE_BASE_URL}${normalizedProfile.username}`,
	};

	// Format output based on options
	if (options.json) {
		return formatJson(profileWithUrl);
	}

	return formatProfile(profileWithUrl);
}
