/**
 * Helpers for parsing /me responses.
 */

import { LINKEDIN_PROFILE_BASE_URL } from "./constants.js";
import type { NormalizedProfile } from "./types.js";

interface MiniProfileIncluded {
	firstName: string;
	lastName: string;
	occupation: string;
	publicIdentifier: string;
	objectUrn: string;
	entityUrn?: string;
	dashEntityUrn?: string;
}

export interface MeResponse {
	// Legacy format
	miniProfile?: MiniProfileIncluded;
	// Normalized format
	data?: {
		"*miniProfile"?: string;
	};
	included?: MiniProfileIncluded[];
}

/**
 * Parse /me response into normalized profile.
 * Handles both legacy format (miniProfile) and normalized format (data + included).
 */
export function parseMeResponse(data: MeResponse): NormalizedProfile {
	let mini: MiniProfileIncluded | undefined;

	if (data.miniProfile) {
		mini = data.miniProfile;
	} else if (data.included?.length) {
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
