/**
 * Shared constants for the LinkedIn CLI.
 */

/**
 * Base URL for LinkedIn profile pages.
 * Use this constant when constructing profile URLs to ensure consistency.
 *
 * @example
 * const profileUrl = `${LINKEDIN_PROFILE_BASE_URL}${username}`;
 */
export const LINKEDIN_PROFILE_BASE_URL = "https://www.linkedin.com/in/";

/**
 * Decoration ID for full profile data in Voyager dash endpoint.
 */
export const LINKEDIN_PROFILE_DECORATION_ID =
	"com.linkedin.voyager.dash.deco.identity.profile.FullProfile-76";
