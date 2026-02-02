/**
 * Connections command - List your LinkedIn connections.
 * Supports pagination with --start and --count options.
 */

import type { LinkedInCredentials } from "../lib/auth.js";
import { LinkedInClient } from "../lib/client.js";
import { buildHeaders } from "../lib/headers.js";
import { parseConnectionsFromFlagshipRsc } from "../lib/parser.js";
import type { NormalizedConnection } from "../lib/types.js";
import { formatConnection, formatPagination } from "../output/human.js";
import { formatJson } from "../output/json.js";

export interface ConnectionsOptions {
	json?: boolean;
	start?: number;
	count?: number;
}

interface ConnectionsResult {
	connections: NormalizedConnection[];
	paging: {
		total: number;
		count: number;
		start: number;
	};
}

const FLAGSHIP_CONNECTIONS_URL =
	"https://www.linkedin.com/flagship-web/rsc-action/actions/pagination?sduiid=com.linkedin.sdui.pagers.mynetwork.connectionsList";
const FLAGSHIP_CONNECTIONS_REFERER =
	"https://www.linkedin.com/mynetwork/invite-connect/connections/";
const FLAGSHIP_PAGE_INSTANCE =
	"urn:li:page:d_flagship3_people_connections;fkBHD5OCSzq7lUUo2+5Oiw==";
const FLAGSHIP_TRACK =
	'{"clientVersion":"0.2.3802","mpVersion":"0.2.3802","osName":"web","timezoneOffset":-5,"timezone":"America/New_York","deviceFormFactor":"DESKTOP","mpName":"web","displayDensity":2,"displayWidth":3024,"displayHeight":1964}';

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

	const headers = {
		...buildHeaders(credentials),
		Accept: "*/*",
		"Content-Type": "application/json",
		Origin: "https://www.linkedin.com",
		Referer: FLAGSHIP_CONNECTIONS_REFERER,
		"X-Li-Page-Instance": FLAGSHIP_PAGE_INSTANCE,
		"X-Li-Track": FLAGSHIP_TRACK,
	};

	const normalizedConnections = await fetchConnectionsFromFlagship(client, headers, start, count);

	const result: ConnectionsResult = {
		connections: normalizedConnections,
		paging: {
			start,
			count: normalizedConnections.length,
			total: start + normalizedConnections.length,
		},
	};

	if (options.json) {
		return formatJson(result);
	}

	return formatHumanOutput(result);
}

async function fetchConnectionsFromFlagship(
	client: LinkedInClient,
	headers: Record<string, string>,
	start: number,
	count: number,
): Promise<NormalizedConnection[]> {
	const connections: NormalizedConnection[] = [];
	const seen = new Set<string>();
	let currentStart = start;
	let iterations = 0;

	while (connections.length < count && iterations < 20) {
		const body = JSON.stringify(buildConnectionsPaginationBody(currentStart));
		const response = await client.requestAbsolute(FLAGSHIP_CONNECTIONS_URL, {
			method: "POST",
			headers,
			body,
		});

		const buffer = await response.arrayBuffer();
		const payload = new TextDecoder("utf-8").decode(buffer);
		const pageConnections = parseConnectionsFromFlagshipRsc(payload);

		if (pageConnections.length === 0) {
			break;
		}

		let added = 0;
		for (const connection of pageConnections) {
			if (seen.has(connection.username)) {
				continue;
			}
			seen.add(connection.username);
			connections.push(connection);
			added += 1;
			if (connections.length >= count) {
				break;
			}
		}

		if (added === 0) {
			break;
		}

		currentStart += pageConnections.length;
		iterations += 1;
	}

	return connections;
}

function buildConnectionsPaginationBody(startIndex: number): Record<string, unknown> {
	return {
		pagerId: "com.linkedin.sdui.pagers.mynetwork.connectionsList",
		clientArguments: {
			$type: "proto.sdui.actions.requests.RequestedArguments",
			payload: {
				startIndex,
				sortByOptionBinding: {
					key: "connectionsListSortOption",
					namespace: "connectionsListSortOptionMenu",
				},
			},
			requestedStateKeys: [
				{
					$type: "proto.sdui.StateKey",
					value: "connectionsListSortOption",
					key: {
						$type: "proto.sdui.Key",
						value: { $case: "id", id: "connectionsListSortOption" },
					},
					namespace: "connectionsListSortOptionMenu",
					isEncrypted: false,
				},
			],
			requestMetadata: { $type: "proto.sdui.common.RequestMetadata" },
			states: [
				{
					key: "connectionsListSortOption",
					namespace: "connectionsListSortOptionMenu",
					value: "sortByRecentlyAdded",
					originalProtoCase: "stringValue",
				},
			],
			screenId: "com.linkedin.sdui.flagshipnav.mynetwork.Connections",
		},
		paginationRequest: {
			$type: "proto.sdui.actions.requests.PaginationRequest",
			pagerId: "com.linkedin.sdui.pagers.mynetwork.connectionsList",
			requestedArguments: {
				$type: "proto.sdui.actions.requests.RequestedArguments",
				payload: {
					startIndex,
					sortByOptionBinding: {
						key: "connectionsListSortOption",
						namespace: "connectionsListSortOptionMenu",
					},
				},
				requestedStateKeys: [
					{
						$type: "proto.sdui.StateKey",
						value: "connectionsListSortOption",
						key: {
							$type: "proto.sdui.Key",
							value: { $case: "id", id: "connectionsListSortOption" },
						},
						namespace: "connectionsListSortOptionMenu",
						isEncrypted: false,
					},
				],
				requestMetadata: { $type: "proto.sdui.common.RequestMetadata" },
			},
			trigger: {
				$case: "itemDistanceTrigger",
				itemDistanceTrigger: {
					$type: "proto.sdui.actions.requests.ItemDistanceTrigger",
					preloadDistance: 3,
					preloadLength: 250,
				},
			},
			retryCount: 2,
		},
	};
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
