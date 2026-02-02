/**
 * Cookie-based authentication for LinkedIn Voyager API.
 * Resolves credentials from CLI flags, environment variables, or browser cookies.
 */

import { type Cookie, getCookies } from "@steipete/sweet-cookie";

const LINKEDIN_URL = "https://www.linkedin.com";
const LI_AT_COOKIE = "li_at";
const JSESSIONID_COOKIE = "JSESSIONID";

export interface LinkedInCredentials {
	liAt: string;
	jsessionId: string;
	cookieHeader: string;
	csrfToken: string;
	source: string;
}

export interface CredentialsOptions {
	liAt?: string;
	jsessionId?: string;
	cookieSource?: "chrome"[];
	chromeProfileDir?: string;
}

export interface CredentialsResult {
	credentials: LinkedInCredentials;
	warnings: string[];
}

function stripQuotes(value: string): string {
	if (value.startsWith('"') && value.endsWith('"')) {
		return value.slice(1, -1);
	}
	return value;
}

function buildCookieHeader(liAt: string, jsessionId: string): string {
	return `li_at=${liAt}; JSESSIONID="${jsessionId}"`;
}

function findCookieValue(cookies: Cookie[], name: string): string | undefined {
	const cookie = cookies.find((c) => c.name === name);
	return cookie?.value;
}

interface ChromeCookieResult {
	liAt?: string;
	jsessionId?: string;
	warnings: string[];
}

async function extractChromeCookies(profileDir?: string): Promise<ChromeCookieResult> {
	const warnings: string[] = [];

	try {
		const result = await getCookies({
			url: LINKEDIN_URL,
			browsers: ["chrome"],
			profile: profileDir,
		});

		if (result.warnings) {
			warnings.push(...result.warnings);
		}

		const liAt = findCookieValue(result.cookies, LI_AT_COOKIE);
		const jsessionId = findCookieValue(result.cookies, JSESSIONID_COOKIE);

		if (jsessionId) {
			return { liAt, jsessionId: stripQuotes(jsessionId), warnings };
		}
		return { liAt, jsessionId, warnings };
	} catch {
		return { warnings: ["Failed to extract Chrome cookies"] };
	}
}

export async function resolveCredentials(options: CredentialsOptions): Promise<CredentialsResult> {
	const warnings: string[] = [];

	let liAt: string | undefined = options.liAt;
	let jsessionId: string | undefined = options.jsessionId
		? stripQuotes(options.jsessionId)
		: undefined;
	let source = "";

	// Check CLI flags first
	const hasCliLiAt = Boolean(options.liAt);
	const hasCliJsession = Boolean(options.jsessionId);

	if (hasCliLiAt && hasCliJsession) {
		source = "cli";
	} else {
		// Check environment variables
		const envLiAt = process.env.LINKEDIN_LI_AT;
		const envJsession = process.env.LINKEDIN_JSESSIONID
			? stripQuotes(process.env.LINKEDIN_JSESSIONID)
			: undefined;

		if (!liAt && envLiAt) {
			liAt = envLiAt;
		}
		if (!jsessionId && envJsession) {
			jsessionId = envJsession;
		}

		// Determine source
		if (hasCliLiAt || hasCliJsession) {
			if (envLiAt || envJsession) {
				source = "cli+env";
			} else {
				source = "cli";
			}
		} else if (envLiAt && envJsession) {
			source = "env";
		} else if (envLiAt || envJsession) {
			source = "env";
		}

		// Try Chrome cookies if enabled and we don't have complete credentials
		if (options.cookieSource?.includes("chrome") && (!liAt || !jsessionId)) {
			const chromeResult = await extractChromeCookies(options.chromeProfileDir);
			warnings.push(...chromeResult.warnings);

			if (!liAt && chromeResult.liAt) {
				liAt = chromeResult.liAt;
			}
			if (!jsessionId && chromeResult.jsessionId) {
				jsessionId = chromeResult.jsessionId;
			}

			if (chromeResult.liAt || chromeResult.jsessionId) {
				source = source ? `${source}+chrome` : "chrome";
			}
		}
	}

	// Validate we have both credentials
	if (!liAt || !jsessionId) {
		throw new Error(
			"LinkedIn credentials not found.\n\n" +
				"Set environment variables:\n" +
				"  export LINKEDIN_LI_AT=<your li_at cookie>\n" +
				"  export LINKEDIN_JSESSIONID=<your JSESSIONID cookie>\n\n" +
				"Or use CLI flags:\n" +
				"  --li-at <token> --jsessionid <token>\n\n" +
				"Find these cookies at linkedin.com (DevTools > Application > Cookies)",
		);
	}

	const cookieHeader = buildCookieHeader(liAt, jsessionId);
	const csrfToken = jsessionId; // CSRF token is JSESSIONID without quotes

	return {
		credentials: {
			liAt,
			jsessionId,
			cookieHeader,
			csrfToken,
			source,
		},
		warnings,
	};
}
