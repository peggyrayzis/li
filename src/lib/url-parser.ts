/**
 * LinkedIn URL and URN parser
 *
 * Converts LinkedIn URLs and URNs to a normalized format for API calls.
 * Supports profile URLs, post URLs (both formats), company URLs, and job URLs.
 */

export type ParsedLinkedInUrl = {
	type: "profile" | "post" | "company" | "job";
	identifier: string;
};

/** URN types that map to posts */
const POST_URN_TYPES = new Set(["activity", "ugcPost", "share"]);

/** URN types that map to profiles */
const PROFILE_URN_TYPES = new Set(["member", "fsd_profile"]);

/**
 * Parse a LinkedIn URL, URN, or username into a normalized format.
 *
 * @param input - A LinkedIn URL, URN, or plain username
 * @returns Parsed result with type and identifier, or null if invalid
 *
 * @example
 * parseLinkedInUrl("https://www.linkedin.com/in/peggyrayzis")
 * // { type: "profile", identifier: "peggyrayzis" }
 *
 * @example
 * parseLinkedInUrl("urn:li:activity:7294184927465283584")
 * // { type: "post", identifier: "urn:li:activity:7294184927465283584" }
 */
export function parseLinkedInUrl(input: string): ParsedLinkedInUrl | null {
	const trimmed = input.trim();

	if (!trimmed) {
		return null;
	}

	// Handle URNs directly
	if (trimmed.startsWith("urn:li:")) {
		return parseUrn(trimmed);
	}

	// Handle URLs
	if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
		return parseUrl(trimmed);
	}

	// Treat as plain username (for profile lookups)
	return {
		type: "profile",
		identifier: trimmed,
	};
}

/**
 * Parse a LinkedIn URN string.
 */
function parseUrn(urn: string): ParsedLinkedInUrl | null {
	// Format: urn:li:<type>:<id>
	const match = urn.match(/^urn:li:(\w+):(.+)$/);

	if (!match) {
		return null;
	}

	const [, urnType, urnId] = match;

	if (!urnId) {
		return null;
	}

	if (POST_URN_TYPES.has(urnType)) {
		return { type: "post", identifier: urn };
	}

	if (PROFILE_URN_TYPES.has(urnType)) {
		return { type: "profile", identifier: urn };
	}

	if (urnType === "company") {
		return { type: "company", identifier: urn };
	}

	if (urnType === "job") {
		return { type: "job", identifier: urn };
	}

	return null;
}

/**
 * Parse a LinkedIn URL.
 */
function parseUrl(urlString: string): ParsedLinkedInUrl | null {
	let url: URL;

	try {
		url = new URL(urlString);
	} catch {
		return null;
	}

	// Validate it's a LinkedIn domain
	const hostname = url.hostname.toLowerCase();
	if (!hostname.endsWith("linkedin.com") && hostname !== "linkedin.com") {
		return null;
	}

	const pathname = decodeURIComponent(url.pathname);

	// Profile: /in/<username>
	const profileMatch = pathname.match(/^\/in\/([^/?#]+)/);
	if (profileMatch) {
		const username = profileMatch[1].replace(/\/$/, "");
		return { type: "profile", identifier: username };
	}

	// Post: /feed/update/<urn>
	const feedUpdateMatch = pathname.match(/^\/feed\/update\/(urn:li:\w+:\d+)/);
	if (feedUpdateMatch) {
		return { type: "post", identifier: feedUpdateMatch[1] };
	}

	// Post: /posts/<username>_<slug>-<type>-<id>
	const postsMatch = pathname.match(/-(activity|ugcPost|share)-(\d+)/);
	if (pathname.startsWith("/posts/") && postsMatch) {
		const [, postType, postId] = postsMatch;
		return { type: "post", identifier: `urn:li:${postType}:${postId}` };
	}

	// Company: /company/<slug>
	const companyMatch = pathname.match(/^\/company\/([^/?#]+)/);
	if (companyMatch) {
		const slug = companyMatch[1].replace(/\/$/, "").split("/")[0];
		return { type: "company", identifier: slug };
	}

	// Job: /jobs/view/<id>
	const jobMatch = pathname.match(/^\/jobs\/view\/(\d+)/);
	if (jobMatch) {
		return { type: "job", identifier: jobMatch[1] };
	}

	return null;
}
