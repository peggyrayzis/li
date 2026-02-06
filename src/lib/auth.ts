/**
 * Cookie-based authentication for LinkedIn Voyager API.
 * Resolves credentials from CLI flags, environment variables, or browser cookies.
 */

import { type Cookie, getCookies } from "@steipete/sweet-cookie";

const LINKEDIN_URL = "https://www.linkedin.com";
const LI_AT_COOKIE = "li_at";
const JSESSIONID_COOKIE = "JSESSIONID";
const DEBUG_AUTH = process.env.LI_DEBUG_AUTH === "1" || process.env.LI_DEBUG_AUTH === "true";

type CredentialsError = Error & { warnings: string[] };

function debugAuth(message: string): void {
	if (!DEBUG_AUTH) {
		return;
	}
	process.stderr.write(`[li][auth] ${message}\n`);
}

function createCredentialsError(message: string, warnings: string[]): CredentialsError {
	const error = new Error(message) as CredentialsError;
	error.warnings = warnings;
	return error;
}

export interface LinkedInCredentials {
	liAt: string;
	jsessionId: string;
	cookieHeader: string;
	csrfToken: string;
	source: string;
}

export type BrowserSource = "chrome" | "safari";

export interface CredentialsOptions {
	liAt?: string;
	jsessionId?: string;
	cookieSource?: BrowserSource[];
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

interface BrowserCookieResult {
	liAt?: string;
	jsessionId?: string;
	allCookies?: string;
	warnings: string[];
}

/**
 * Build a full cookie header string from all cookies.
 */
function buildFullCookieHeader(cookies: Cookie[]): string {
	return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

async function extractBrowserCookies(
	browsers: BrowserSource[],
	profileDir?: string,
): Promise<BrowserCookieResult> {
	const warnings: string[] = [];
	const browserList = browsers.join(", ");
	debugAuth(`cookie-extract sources=${browserList} profile=${profileDir ? profileDir : "default"}`);

	try {
		const result = await getCookies({
			url: LINKEDIN_URL,
			browsers: browsers,
			profile: profileDir,
			timeoutMs: 30000
		});

		if (result.warnings) {
			warnings.push(...result.warnings);
		}

		const liAt = findCookieValue(result.cookies, LI_AT_COOKIE);
		const jsessionId = findCookieValue(result.cookies, JSESSIONID_COOKIE);
		const allCookies =
			result.cookies.length > 0 ? buildFullCookieHeader(result.cookies) : undefined;

		debugAuth(
			`cookie-result sources=${browserList} cookies=${result.cookies.length} li_at=${Boolean(
				liAt,
			)} jsessionid=${Boolean(jsessionId)} warnings=${result.warnings?.length ?? 0}`,
		);

		if (jsessionId) {
			return { liAt, jsessionId: stripQuotes(jsessionId), allCookies, warnings };
		}
		return { liAt, jsessionId, allCookies, warnings };
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		const suffix = errorMessage ? ` (${errorMessage})` : "";
		debugAuth(`cookie-error sources=${browserList} message=${errorMessage}`);
		return { warnings: [`Failed to extract cookies from: ${browserList}${suffix}`] };
	}
}

export async function resolveCredentials(options: CredentialsOptions): Promise<CredentialsResult> {
	const warnings: string[] = [];

	let liAt: string | undefined = options.liAt;
	let jsessionId: string | undefined = options.jsessionId
		? stripQuotes(options.jsessionId)
		: undefined;
	let allCookies: string | undefined;
	let source = "";

	// Check CLI flags first
	const hasCliLiAt = Boolean(options.liAt);
	const hasCliJsession = Boolean(options.jsessionId);

	debugAuth(
		`resolve-start cli=${hasCliLiAt || hasCliJsession} cookieSource=${
			options.cookieSource?.join(",") ?? "none"
		}`,
	);

	if (hasCliLiAt && hasCliJsession) {
		source = "cli";
	} else {
		// Check environment variables
		const envLiAt = process.env.LINKEDIN_LI_AT;
		const envJsession = process.env.LINKEDIN_JSESSIONID
			? stripQuotes(process.env.LINKEDIN_JSESSIONID)
			: undefined;
		const envAllCookies = process.env.LINKEDIN_COOKIES;

		if (!liAt && envLiAt) {
			liAt = envLiAt;
		}
		if (!jsessionId && envJsession) {
			jsessionId = envJsession;
		}
		if (envAllCookies) {
			allCookies = envAllCookies;
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

		// Try browser cookies if enabled and we don't have complete credentials
		if (options.cookieSource?.length && (!liAt || !jsessionId)) {
			const browserResult = await extractBrowserCookies(
				options.cookieSource,
				options.chromeProfileDir,
			);
			warnings.push(...browserResult.warnings);

			if (!liAt && browserResult.liAt) {
				liAt = browserResult.liAt;
			}
			if (!jsessionId && browserResult.jsessionId) {
				jsessionId = browserResult.jsessionId;
			}
			if (browserResult.allCookies) {
				allCookies = browserResult.allCookies;
			}

			if (browserResult.liAt || browserResult.jsessionId) {
				const browserSource = options.cookieSource.join("+");
				source = source ? `${source}+${browserSource}` : browserSource;
			}
		}
	}

	// Validate we have both credentials
	if (!liAt || !jsessionId) {
		debugAuth(
			`resolve-missing li_at=${Boolean(liAt)} jsessionid=${Boolean(
				jsessionId,
			)} warnings=${warnings.length}`,
		);
		throw createCredentialsError(
			"LinkedIn credentials not found.\n\n" +
				"Set environment variables:\n" +
				"  export LINKEDIN_LI_AT=<your li_at cookie>\n" +
				"  export LINKEDIN_JSESSIONID=<your JSESSIONID cookie>\n\n" +
				"Or use CLI flags:\n" +
				"  --li-at <token> --jsessionid <token>\n\n" +
				"Find these cookies at linkedin.com (DevTools > Application > Cookies)",
			warnings,
		);
	}

	// Use full cookie string if available, otherwise build minimal one
	const cookieHeader = allCookies || buildCookieHeader(liAt, jsessionId);
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
