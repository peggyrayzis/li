/**
 * li - LinkedIn CLI library exports.
 * Use these to integrate LinkedIn functionality into your own applications.
 */

export { check } from "./commands/check.js";
export { connect } from "./commands/connect.js";
export { connections } from "./commands/connections.js";
export { acceptInvite, listInvites } from "./commands/invites.js";
export { listConversations, readConversation } from "./commands/messages.js";
export { profile } from "./commands/profile.js";
export { send } from "./commands/send.js";
// Commands (for programmatic use)
export { whoami } from "./commands/whoami.js";
export type { CredentialsOptions, CredentialsResult, LinkedInCredentials } from "./lib/auth.js";
// Auth
export { resolveCredentials } from "./lib/auth.js";
// Client
export { LinkedInApiError, LinkedInClient } from "./lib/client.js";
// Constants
export { LINKEDIN_PROFILE_BASE_URL } from "./lib/constants.js";
export type { NormalizedConversation, NormalizedMessage } from "./lib/parser.js";
export {
	extractLocalized,
	parseConnection,
	parseConversation,
	parseInvitation,
	parseMessage,
	parseProfile,
} from "./lib/parser.js";
// Recipient resolution
export type { ResolvedRecipient } from "./lib/recipient.js";
export { resolveRecipient } from "./lib/recipient.js";
export type { ParsedLinkedInUrl } from "./lib/url-parser.js";
// Parsing
export { extractIdFromUrn, parseLinkedInUrl } from "./lib/url-parser.js";
// Output formatting
export { formatPagination } from "./output/human.js";
// Output types
export type {
	NetworkInfo,
	NormalizedConnection,
	NormalizedInvitation,
	NormalizedProfile,
} from "./output/types.js";
