/**
 * Unified types for LinkedIn data.
 * Single source of truth for all normalized LinkedIn API data structures.
 */

// Re-export the constant from constants.ts for backwards compatibility
export { LINKEDIN_PROFILE_BASE_URL } from "./constants.js";

/**
 * Normalized profile data from Voyager API.
 */
export interface NormalizedProfile {
	urn: string;
	username: string;
	firstName: string;
	lastName: string;
	headline: string;
	location: string;
	profileUrl: string;
	/** Industry is only available on full profile views */
	industry?: string;
	/** Summary is only available on full profile views */
	summary?: string;
}

/**
 * Normalized connection data.
 * Used for connections, message participants, and invitation inviters.
 */
export interface NormalizedConnection {
	urn: string;
	username: string;
	firstName: string;
	lastName: string;
	headline: string;
	profileUrl: string;
}

/**
 * Normalized conversation data from /messaging/conversations endpoint.
 */
export interface NormalizedConversation {
	conversationId: string;
	/** Primary participant (first in participants array) */
	participant: NormalizedConnection;
	/** All participants in the conversation */
	participants: NormalizedConnection[];
	/** Body of the last message */
	lastMessage: string;
	lastActivityAt: Date;
	unreadCount: number;
	totalEventCount: number;
	read: boolean;
	groupChat: boolean;
}

/**
 * Normalized message data from conversation events.
 */
export interface NormalizedMessage {
	messageId: string;
	conversationId: string;
	sender: NormalizedConnection;
	body: string;
	createdAt: Date;
	attachments: unknown[];
}

/**
 * Normalized invitation data from /relationships/invitationViews endpoint.
 */
export interface NormalizedInvitation {
	invitationId: string;
	urn: string;
	sharedSecret: string;
	type: string;
	inviter: NormalizedConnection;
	message?: string;
	sharedConnections: number;
	sentAt: Date;
}

/**
 * Network statistics for a profile.
 */
export interface NetworkInfo {
	followersCount: number;
	connectionsCount: number;
	connectionsDisplay?: string;
}
