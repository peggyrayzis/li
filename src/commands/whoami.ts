/**
 * Whoami command - shows logged-in user info and network counts.
 * Calls /me endpoint to get current user profile and networkinfo for connection counts.
 */

import type { LinkedInCredentials } from "../lib/auth.js";
import { LinkedInClient } from "../lib/client.js";
import endpoints from "../lib/endpoints.json" with { type: "json" };
import { formatWhoami } from "../output/human.js";
import { formatJson } from "../output/json.js";
import type { NetworkInfo, NormalizedProfile } from "../output/types.js";

export interface WhoamiOptions {
	json?: boolean;
}

interface MeResponse {
	miniProfile: {
		firstName: string;
		lastName: string;
		occupation: string;
		publicIdentifier: string;
		objectUrn: string;
		entityUrn: string;
	};
}

interface NetworkInfoResponse {
	followersCount: number;
	connectionsCount: number;
	followingCount?: number;
}

/**
 * Parse /me response into normalized profile.
 */
function parseMeResponse(data: MeResponse): NormalizedProfile {
	const mini = data.miniProfile;
	return {
		urn: mini.entityUrn,
		username: mini.publicIdentifier,
		firstName: mini.firstName,
		lastName: mini.lastName,
		headline: mini.occupation,
		location: "",
		profileUrl: `https://www.linkedin.com/in/${mini.publicIdentifier}`,
	};
}

/**
 * Parse networkinfo response into network info.
 */
function parseNetworkInfo(data: NetworkInfoResponse): NetworkInfo {
	return {
		followersCount: data.followersCount,
		connectionsCount: data.connectionsCount,
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

	// Get network info using username from /me response
	const networkInfoPath = endpoints.endpoints.networkInfo.replace("{username}", profile.username);
	const networkInfoResponse = await client.request(networkInfoPath);
	const networkInfoData = (await networkInfoResponse.json()) as NetworkInfoResponse;
	const networkInfo = parseNetworkInfo(networkInfoData);

	// Return JSON or human-readable output
	if (options.json) {
		return formatJson({
			profile,
			networkInfo,
		});
	}

	return formatWhoami(profile, networkInfo);
}
