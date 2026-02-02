/**
 * Request header construction for LinkedIn Voyager API.
 * Builds the required headers for all Voyager API requests.
 *
 * Based on open-linkedin-api which uses minimal headers.
 * Over-specifying headers can trigger bot detection.
 */

import type { LinkedInCredentials } from "./auth.js";

/**
 * User-Agent string matching Chrome on macOS.
 */
const USER_AGENT =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * Builds the required HTTP headers for LinkedIn Voyager API requests.
 * Uses minimal headers to avoid bot detection.
 *
 * @param credentials - LinkedIn session credentials
 * @returns Record of header name to value
 */
export function buildHeaders(credentials: LinkedInCredentials): Record<string, string> {
	// Minimal headers based on open-linkedin-api
	// Over-specifying (x-li-track, etc.) can trigger detection
	return {
		Cookie: credentials.cookieHeader,
		"csrf-token": credentials.csrfToken,
		"User-Agent": USER_AGENT,
		Accept: "application/vnd.linkedin.normalized+json+2.1",
		"Accept-Language": "en-AU,en-GB;q=0.9,en-US;q=0.8,en;q=0.7",
		"X-Li-Lang": "en_US",
		"X-Restli-Protocol-Version": "2.0.0",
	};
}
