/**
 * Request header construction for LinkedIn Voyager API.
 * Builds the required headers for all Voyager API requests.
 *
 * Based on open-linkedin-api which uses minimal headers.
 * Over-specifying headers can trigger bot detection.
 */

import { execSync } from "node:child_process";
import type { LinkedInCredentials } from "./auth.js";

const FALLBACK_CHROME_VERSION = "135";

/**
 * Detect the installed Chrome major version at runtime.
 * Falls back to a recent version if detection fails.
 */
function detectChromeMajorVersion(): string {
	try {
		const raw =
			process.platform === "darwin"
				? execSync(
						"/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --version 2>/dev/null",
						{ encoding: "utf8", timeout: 3000 },
					)
				: execSync("google-chrome --version 2>/dev/null || chromium --version 2>/dev/null", {
						encoding: "utf8",
						timeout: 3000,
					});
		const match = raw.match(/(\d+)\./);
		if (match) {
			return match[1];
		}
	} catch {
		// Detection failed — use fallback.
	}
	return FALLBACK_CHROME_VERSION;
}

let cachedUserAgent: string | undefined;

/**
 * Returns a User-Agent string matching the locally installed Chrome version.
 * Result is cached for the process lifetime.
 */
export function getUserAgent(): string {
	if (!cachedUserAgent) {
		const major = detectChromeMajorVersion();
		cachedUserAgent = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
	}
	return cachedUserAgent;
}

/**
 * @deprecated Use getUserAgent() instead.
 */
export const USER_AGENT = getUserAgent();

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
		"User-Agent": getUserAgent(),
		Accept: "application/vnd.linkedin.normalized+json+2.1",
		"Accept-Language": "en-AU,en-GB;q=0.9,en-US;q=0.8,en;q=0.7",
		"X-Li-Lang": "en_US",
		"X-Restli-Protocol-Version": "2.0.0",
	};
}

/**
 * Builds headers for LinkedIn web (HTML/asset) requests.
 */
export function buildWebHeaders(credentials: LinkedInCredentials): Record<string, string> {
	return {
		Cookie: credentials.cookieHeader,
		"User-Agent": getUserAgent(),
		Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
		"Accept-Language": "en-US,en;q=0.9",
	};
}
