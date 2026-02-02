/**
 * Cookie-based authentication for LinkedIn Voyager API.
 * Resolves credentials from CLI flags, environment variables, or browser cookies.
 */

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

		// TODO: v0.1 - Add Chrome cookie extraction via @steipete/sweet-cookie
		// For now, only env vars and CLI flags are supported
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
