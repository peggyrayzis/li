/**
 * Human-readable output formatting for the LinkedIn CLI.
 * Uses emoji and colors for rich terminal output.
 */

import pc from "picocolors";
import type {
	NetworkInfo,
	NormalizedConnection,
	NormalizedConversation,
	NormalizedInvitation,
	NormalizedMessage,
	NormalizedProfile,
} from "./types.js";

const MAX_PREVIEW_LENGTH = 60;

/**
 * Format a timestamp as relative time or absolute date.
 */
function formatTime(date: Date): string {
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / (1000 * 60));
	const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

	if (diffMins < 1) {
		return "just now";
	}
	if (diffMins < 60) {
		return `${diffMins}m ago`;
	}
	if (diffHours < 24) {
		return `${diffHours}h ago`;
	}
	if (diffDays < 7) {
		return `${diffDays}d ago`;
	}

	return date.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
	});
}

/**
 * Format a number with comma separators.
 */
function formatNumber(num: number): string {
	return num.toLocaleString("en-US");
}

/**
 * Truncate a string with ellipsis if it exceeds max length.
 */
function truncate(text: string, maxLength: number): string {
	if (text.length <= maxLength) {
		return text;
	}
	return `${text.slice(0, maxLength - 3)}...`;
}

/**
 * Format a profile for display.
 * Shows name, headline, location, and profile URL.
 */
export function formatProfile(profile: NormalizedProfile): string {
	const lines: string[] = [];

	// Name with emoji
	const fullName = `${profile.firstName} ${profile.lastName}`;
	lines.push(`\u{1F464} ${pc.bold(fullName)} ${pc.dim(`@${profile.username}`)}`);

	// Headline
	if (profile.headline) {
		lines.push(`   ${profile.headline}`);
	}

	// Location
	if (profile.location) {
		lines.push(`   ${pc.dim(profile.location)}`);
	}

	// Profile URL
	lines.push(`   ${pc.cyan(profile.profileUrl)}`);

	return lines.join("\n");
}

/**
 * Format a connection for display.
 * Shows name and headline in a compact format.
 */
export function formatConnection(connection: NormalizedConnection): string {
	const fullName = `${connection.firstName} ${connection.lastName}`;
	const parts = [`\u{1F517} ${pc.bold(fullName)} ${pc.dim(`@${connection.username}`)}`];

	if (connection.headline) {
		parts.push(`   ${pc.dim(connection.headline)}`);
	}

	return parts.join("\n");
}

/**
 * Format a conversation for display.
 * Shows participant, preview, and unread indicator.
 */
export function formatConversation(convo: NormalizedConversation): string {
	const participant = convo.participant;
	const fullName = `${participant.firstName} ${participant.lastName}`;

	// Unread indicator
	const unreadIndicator = convo.unreadCount > 0 ? pc.red(`(${convo.unreadCount} unread) `) : "";

	// Participant name
	const nameLine = `\u{1F4AC} ${unreadIndicator}${pc.bold(fullName)} ${pc.dim(`@${participant.username}`)}`;

	// Message preview - truncated
	const preview = truncate(convo.lastMessage, MAX_PREVIEW_LENGTH);
	const previewLine = `   ${pc.dim(preview)}`;

	// Time
	const timeLine = `   ${pc.gray(formatTime(convo.lastActivityAt))}`;

	return [nameLine, previewLine, timeLine].join("\n");
}

/**
 * Format a message for display.
 * Shows sender, body, and timestamp.
 */
export function formatMessage(message: NormalizedMessage): string {
	const sender = message.sender;
	const fullName = `${sender.firstName} ${sender.lastName}`;

	const lines: string[] = [];

	// Sender with timestamp
	lines.push(
		`\u{1F4AC} ${pc.bold(fullName)} ${pc.dim(`@${sender.username}`)} ${pc.gray(formatTime(message.createdAt))}`,
	);

	// Message body
	lines.push(`   ${message.body}`);

	return lines.join("\n");
}

/**
 * Format whoami output.
 * Shows user info with network counts.
 */
export function formatWhoami(me: NormalizedProfile, networkInfo: NetworkInfo): string {
	const fullName = `${me.firstName} ${me.lastName}`;
	const lines: string[] = [];

	// Name with emoji
	lines.push(`\u{1F464} ${pc.bold(fullName)} ${pc.dim(`@${me.username}`)}`);

	// Headline
	if (me.headline) {
		lines.push(`   ${me.headline}`);
	}

	// Network stats
	const followers = formatNumber(networkInfo.followersCount);
	const connections = formatNumber(networkInfo.connectionsCount);
	lines.push(`   ${pc.green(followers)} followers \u{00B7} ${pc.blue(connections)} connections`);

	// Profile URL
	lines.push(`   ${pc.cyan(me.profileUrl)}`);

	return lines.join("\n");
}

/**
 * Format an invitation for display.
 * Shows inviter info, message, and shared connections.
 */
export function formatInvitation(invite: NormalizedInvitation): string {
	const inviter = invite.inviter;
	const fullName = `${inviter.firstName} ${inviter.lastName}`;
	const lines: string[] = [];

	// Inviter name with emoji
	lines.push(`\u{1F4E8} ${pc.bold(fullName)} ${pc.dim(`@${inviter.username}`)}`);

	// Headline
	if (inviter.headline) {
		lines.push(`   ${pc.dim(inviter.headline)}`);
	}

	// Invitation message if present
	if (invite.message) {
		lines.push(`   "${truncate(invite.message, MAX_PREVIEW_LENGTH)}"`);
	}

	// Shared connections and time
	const sharedText =
		invite.sharedConnections > 0
			? `${invite.sharedConnections} shared connections`
			: "No shared connections";
	lines.push(`   ${pc.gray(sharedText)} \u{00B7} ${pc.gray(formatTime(invite.sentAt))}`);

	return lines.join("\n");
}
