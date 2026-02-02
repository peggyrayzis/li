/**
 * Normalized types for output formatting.
 * These types represent LinkedIn data after parsing from Voyager API responses.
 */

export interface NormalizedProfile {
	urn: string;
	username: string;
	firstName: string;
	lastName: string;
	headline: string;
	location: string;
	profileUrl: string;
}

export interface NormalizedConnection {
	urn: string;
	username: string;
	firstName: string;
	lastName: string;
	headline: string;
	profileUrl: string;
}

export interface NormalizedConversation {
	conversationId: string;
	participant: NormalizedConnection;
	lastMessage: string;
	lastActivityAt: Date;
	unreadCount: number;
	totalEventCount: number;
}

export interface NormalizedMessage {
	messageId: string;
	conversationId: string;
	sender: NormalizedConnection;
	body: string;
	createdAt: Date;
}

export interface NormalizedInvitation {
	invitationId: string;
	inviter: NormalizedConnection;
	message?: string;
	sentAt: Date;
	sharedConnections: number;
}

export interface NetworkInfo {
	followersCount: number;
	connectionsCount: number;
}
