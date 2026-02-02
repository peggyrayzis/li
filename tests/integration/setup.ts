/**
 * Integration test setup and gating utilities.
 *
 * Integration tests only run when LINKEDIN_INTEGRATION_TEST=1 is set.
 * They require real LinkedIn credentials via environment variables.
 */

import "dotenv/config";
import { type LinkedInCredentials, resolveCredentials } from "../../src/lib/auth.js";

/**
 * Check if integration tests should run.
 * Tests are skipped unless LINKEDIN_INTEGRATION_TEST=1.
 */
export const shouldRunIntegration = process.env.LINKEDIN_INTEGRATION_TEST === "1";

/**
 * Reason displayed when tests are skipped.
 */
export const skipReason = "Integration tests skipped. Set LINKEDIN_INTEGRATION_TEST=1 to run.";

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
	const result = await resolveCredentials({
		cookieSource: process.env.LINKEDIN_LI_AT ? undefined : ["chrome", "safari"],
	});
	cachedCredentials = result.credentials;
	return cachedCredentials;
}
