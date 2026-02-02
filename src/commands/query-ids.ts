import type { LinkedInCredentials } from "../lib/auth.js";
import { LinkedInClient } from "../lib/client.js";
import { runtimeQueryIds } from "../lib/runtime-query-ids.js";

export interface QueryIdsOptions {
	json?: boolean;
	refresh?: boolean;
	har?: string;
	auto?: boolean;
	credentials?: LinkedInCredentials;
}

interface QueryIdsJsonOutput {
	cached: boolean;
	cachePath: string;
	fetchedAt?: string;
	isFresh?: boolean;
	ageMs?: number;
	ids?: Record<string, string>;
	discovery?: {
		harPath?: string;
	};
}

const OPERATIONS = ["messengerConversationsBySyncToken", "messengerConversations"] as const;

export async function queryIds(options: QueryIdsOptions = {}): Promise<string> {
	const harPath =
		options.har ?? process.env.LINKEDIN_MESSAGING_HAR ?? "www.linkedin.com.fullv3.har";

	if (options.refresh) {
		if (options.auto) {
			if (!options.credentials) {
				throw new Error("Credentials required for auto refresh");
			}
			const client = new LinkedInClient(options.credentials);
			await runtimeQueryIds.refreshFromLinkedIn(client, [...OPERATIONS]);
		} else {
			await runtimeQueryIds.refreshFromHar([...OPERATIONS], harPath);
		}
	}

	const info = await runtimeQueryIds.getSnapshotInfo();
	if (!info) {
		if (options.json) {
			const payload: QueryIdsJsonOutput = {
				cached: false,
				cachePath: runtimeQueryIds.cachePath,
				discovery: { harPath },
			};
			return `${JSON.stringify(payload, null, 2)}\n`;
		}
		return [
			"No cached query IDs yet.",
			"Run: li query-ids --refresh --auto",
			`cache_path: ${runtimeQueryIds.cachePath}`,
			`har_path: ${harPath}`,
		].join("\n");
	}

	if (options.json) {
		const payload: QueryIdsJsonOutput = {
			cached: true,
			cachePath: info.cachePath,
			fetchedAt: info.snapshot.fetchedAt,
			isFresh: info.isFresh,
			ageMs: info.ageMs,
			ids: info.snapshot.ids,
			discovery: info.snapshot.discovery,
		};
		return `${JSON.stringify(payload, null, 2)}\n`;
	}

	const opsCount = Object.keys(info.snapshot.ids).length;
	return [
		"GraphQL query IDs cached",
		`path: ${info.cachePath}`,
		`fetched_at: ${info.snapshot.fetchedAt}`,
		`fresh: ${info.isFresh ? "yes" : "no"}`,
		`ops: ${opsCount}`,
	].join("\n");
}
