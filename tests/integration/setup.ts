/**
 * Integration test setup and gating utilities.
 *
 * Integration tests only run when LINKEDIN_INTEGRATION_TEST=1 is set.
 * They require real LinkedIn credentials via environment variables.
 */

import "dotenv/config";
import { type LinkedInCredentials, resolveCredentials } from "../../src/lib/auth.js";

const hasEnvCredentials = Boolean(process.env.LINKEDIN_LI_AT && process.env.LINKEDIN_JSESSIONID);
const cookieSourceOverride = process.env.LI_INTEGRATION_COOKIE_SOURCE?.trim().toLowerCase();
const allowSafari = cookieSourceOverride === "safari";

/**
 * Check if integration tests should run.
 * Tests are skipped unless LINKEDIN_INTEGRATION_TEST=1 and credentials are available.
 */
export const shouldRunIntegration =
	process.env.LINKEDIN_INTEGRATION_TEST === "1" && (hasEnvCredentials || allowSafari);

/**
 * Reason displayed when tests are skipped.
 */
export const skipReason =
	"Integration tests skipped. Set LINKEDIN_INTEGRATION_TEST=1 and provide env credentials " +
	"(LINKEDIN_LI_AT/LINKEDIN_JSESSIONID) or set LI_INTEGRATION_COOKIE_SOURCE=safari.";

/**
 * Cached credentials to avoid repeated resolution.
 */
let cachedCredentials: LinkedInCredentials | null = null;

/**
 * Get LinkedIn credentials from environment variables.
 * Uses cached value after first call to minimize overhead.
 *
 * @returns LinkedIn credentials for API calls
 * @throws Error if credentials are not configured
 */
export async function getCredentials(): Promise<LinkedInCredentials> {
	if (cachedCredentials) {
		return cachedCredentials;
	}

	// Prefer env vars, fall back to browser cookies
	if (!hasEnvCredentials && !allowSafari) {
		throw new Error(
			"Integration credentials missing. Set LINKEDIN_LI_AT/LINKEDIN_JSESSIONID " +
				"or set LI_INTEGRATION_COOKIE_SOURCE=safari.",
		);
	}

	const result = await resolveCredentials({
		cookieSource: hasEnvCredentials ? undefined : ["safari"],
	});
	cachedCredentials = result.credentials;
	return cachedCredentials;
}
