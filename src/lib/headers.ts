/**
 * Request header construction for LinkedIn Voyager API.
 * Builds the required headers for all Voyager API requests.
 */

import type { LinkedInCredentials } from "./auth.js";

/**
 * User-Agent string matching a modern Chrome browser on macOS.
 * LinkedIn checks for realistic browser fingerprints.
 */
const USER_AGENT =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * X-Li-Track header payload.
 * Contains client version and device info that LinkedIn expects.
 */
function buildLiTrack(): string {
	return JSON.stringify({
		clientVersion: "1.13.8201",
		mpVersion: "1.13.8201",
		osName: "web",
		timezoneOffset: -8,
		timezone: "America/Los_Angeles",
		deviceFormFactor: "DESKTOP",
		mpName: "voyager-web",
	});
}

/**
 * Builds the required HTTP headers for LinkedIn Voyager API requests.
 *
 * @param credentials - LinkedIn session credentials
 * @returns Record of header name to value
 */
export function buildHeaders(credentials: LinkedInCredentials): Record<string, string> {
	return {
		Cookie: credentials.cookieHeader,
		"csrf-token": credentials.csrfToken,
		"User-Agent": USER_AGENT,
		"X-Li-Lang": "en_US",
		"X-Li-Track": buildLiTrack(),
		"X-Restli-Protocol-Version": "2.0.0",
		Accept: "application/vnd.linkedin.normalized+json+2.1",
	};
}
