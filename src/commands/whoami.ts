/**
 * Whoami command - shows logged-in user info and network counts.
 * Calls /me endpoint to get current user profile and networkinfo for connection counts.
 */

import type { LinkedInCredentials } from "../lib/auth.js";
import { LinkedInClient } from "../lib/client.js";
import { LINKEDIN_PROFILE_BASE_URL, LINKEDIN_WHOAMI_FOLLOWER_QUERY_ID } from "../lib/constants.js";
import endpoints from "../lib/endpoints.json" with { type: "json" };
import { formatWhoami } from "../output/human.js";
import { formatJson } from "../output/json.js";
import type { NetworkInfo, NormalizedProfile } from "../output/types.js";

export interface WhoamiOptions {
	json?: boolean;
}

interface MiniProfileIncluded {
	firstName: string;
	lastName: string;
	occupation: string;
	publicIdentifier: string;
	objectUrn: string;
	entityUrn?: string;
	dashEntityUrn?: string;
}

interface MeResponse {
	// Legacy format
	miniProfile?: MiniProfileIncluded;
	// Normalized format
	data?: {
		"*miniProfile"?: string;
	};
	included?: MiniProfileIncluded[];
}

interface GraphQLResponse {
	included?: Array<Record<string, unknown>>;
}

/**
 * Parse /me response into normalized profile.
 * Handles both legacy format (miniProfile) and normalized format (data + included).
 */
function parseMeResponse(data: MeResponse): NormalizedProfile {
	let mini: MiniProfileIncluded | undefined;

	// Try legacy format first
	if (data.miniProfile) {
		mini = data.miniProfile;
	}
	// Try normalized format (data + included arrays)
	else if (data.included?.length) {
		mini = data.included[0];
	}

	if (!mini) {
		throw new Error("Could not parse profile from /me response");
	}

	const urn = mini.entityUrn ?? mini.dashEntityUrn ?? mini.objectUrn;
	return {
		urn,
		username: mini.publicIdentifier,
		firstName: mini.firstName,
		lastName: mini.lastName,
		headline: mini.occupation,
		location: "",
		profileUrl: `${LINKEDIN_PROFILE_BASE_URL}${mini.publicIdentifier}`,
	};
}

/**
 * Execute the whoami command.
 *
 * @param credentials - LinkedIn credentials for authentication
 * @param options - Command options (json flag)
 * @returns Formatted output string
 */
export async function whoami(
	credentials: LinkedInCredentials,
	options: WhoamiOptions = {},
): Promise<string> {
	const client = new LinkedInClient(credentials);

	// Get current user profile from /me
	const meResponse = await client.request(endpoints.endpoints.me);
	const meData = (await meResponse.json()) as MeResponse;
	const profile = parseMeResponse(meData);

	let networkInfo: NetworkInfo = { followersCount: 0, connectionsCount: 0 };

	const followerCount = await fetchFollowerCount(client, profile.username);
	networkInfo = {
		followersCount: followerCount ?? 0,
		connectionsCount: 0,
		connectionsDisplay: "500+",
	};

	// Return JSON or human-readable output
	if (options.json) {
		return formatJson({
			profile,
			networkInfo,
		});
	}

	return formatWhoami(profile, networkInfo);
}

async function fetchFollowerCount(
	client: LinkedInClient,
	username: string,
): Promise<number | null> {
	try {
		const queryPath = `/graphql?includeWebMetadata=true&variables=(vanityName:${encodeURIComponent(
			username,
		)})&queryId=${LINKEDIN_WHOAMI_FOLLOWER_QUERY_ID}`;
		const response = await client.request(queryPath);
		const data = (await response.json()) as GraphQLResponse;
		const included = Array.isArray(data.included) ? data.included : [];

		for (const item of included) {
			if (!item || typeof item !== "object") {
				continue;
			}
			const followerCount = (item as { followerCount?: unknown }).followerCount;
			if (typeof followerCount === "number") {
				return followerCount;
			}
		}

		return null;
	} catch {
		return null;
	}
}

// Connections count is not reliably exposed in API responses; use a display fallback.
