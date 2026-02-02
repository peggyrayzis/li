/**
 * Connections command - List your LinkedIn connections.
 * Supports pagination with --start and --count options.
 */

import type { LinkedInCredentials } from "../lib/auth.js";
import { LinkedInClient } from "../lib/client.js";
import { parseConnection } from "../lib/parser.js";
import type { NormalizedConnection } from "../lib/types.js";
import { formatConnection, formatPagination } from "../output/human.js";
import { formatJson } from "../output/json.js";

export interface ConnectionsOptions {
	json?: boolean;
	start?: number;
	count?: number;
}

interface ConnectionsResponse {
	elements: Array<Record<string, unknown>>;
	paging: {
		total: number;
		count: number;
		start: number;
	};
}

interface ConnectionsResult {
	connections: NormalizedConnection[];
	paging: {
		total: number;
		count: number;
		start: number;
	};
}

/**
 * List LinkedIn connections with pagination support.
 *
 * @param credentials - LinkedIn credentials
 * @param options - Command options (json, start, count)
 * @returns Formatted output string (human-readable or JSON)
 */
export async function connections(
	credentials: LinkedInCredentials,
	options: ConnectionsOptions = {},
): Promise<string> {
	const client = new LinkedInClient(credentials);
	const start = options.start ?? 0;
	const count = Math.min(options.count ?? 20, 50);

	const response = await client.request(
		`/relationships/dash/connections?start=${start}&count=${count}`,
	);
	const data = (await response.json()) as ConnectionsResponse;

	// parseConnection now returns NormalizedConnection directly with profileUrl
	const normalizedConnections = data.elements.map((element) => parseConnection(element));

	const result: ConnectionsResult = {
		connections: normalizedConnections,
		paging: data.paging,
	};

	if (options.json) {
		return formatJson(result);
	}

	return formatHumanOutput(result);
}

/**
 * Format connections for human-readable output.
 */
function formatHumanOutput(result: ConnectionsResult): string {
	if (result.connections.length === 0) {
		return "No connections found.";
	}

	const lines: string[] = [];

	for (const connection of result.connections) {
		lines.push(formatConnection(connection));
		lines.push(""); // Add blank line between connections
	}

	// Add paging info
	const { start, count, total } = result.paging;
	const end = Math.min(start + count, total);
	lines.push(`${formatPagination(start, end, total)} connections`);

	return lines.join("\n");
}
