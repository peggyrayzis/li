/**
 * Connections command - List your LinkedIn connections.
 * Supports pagination with --start and --count options.
 */

import fs from "node:fs";
import type { LinkedInCredentials } from "../lib/auth.js";
import { LinkedInClient } from "../lib/client.js";
import { buildHeaders } from "../lib/headers.js";
import { buildLiTrackHeader } from "../lib/li-track.js";
import {
	parseConnectionsFromFlagshipRsc,
	parseConnectionsFromSearchHtml,
	parseConnectionsFromSearchStream,
} from "../lib/parser.js";
import { resolveRecipient } from "../lib/recipient.js";
import type { NormalizedConnection } from "../lib/types.js";
import { extractIdFromUrn, parseLinkedInUrl } from "../lib/url-parser.js";
import { formatConnection, formatPagination } from "../output/human.js";
import { formatJson } from "../output/json.js";

export interface ConnectionsOptions {
	json?: boolean;
	start?: number;
	count?: number;
	all?: boolean;
	of?: string;
	fast?: boolean;
	noProgress?: boolean;
	network?: NetworkDegree[];
	experimentalSearchDash?: boolean;
}

interface ConnectionsResult {
	connections: NormalizedConnection[];
	paging: {
		total: number | null;
		count: number;
		start: number;
	};
}

const FLAGSHIP_CONNECTIONS_URL =
	"https://www.linkedin.com/flagship-web/rsc-action/actions/pagination?sduiid=com.linkedin.sdui.pagers.mynetwork.connectionsList";
const FLAGSHIP_CONNECTIONS_OF_URL = "https://www.linkedin.com/flagship-web/search/results/people/";
const VOYAGER_SEARCH_DASH_CLUSTERS_URL =
	"https://www.linkedin.com/voyager/api/search/dash/clusters";
const FLAGSHIP_CONNECTIONS_REFERER =
	"https://www.linkedin.com/mynetwork/invite-connect/connections/";
const FLAGSHIP_PAGE_INSTANCE =
	"urn:li:page:d_flagship3_people_connections;fkBHD5OCSzq7lUUo2+5Oiw==";
const FLAGSHIP_SEARCH_PAGE_INSTANCE =
	"urn:li:page:d_flagship3_search_srp_people;4GLXsZt9SMWi+zWnoT3o9w==";
const CONNECTIONS_OF_PAGE_SIZE = 10;
const CONNECTIONS_OF_ORIGIN = "FACETED_SEARCH";
const FAST_DELAY_MIN_MS = 200;
const FAST_DELAY_MAX_MS = 600;
const MAX_STALL_PAGES = 3;
const MAX_EMPTY_SEARCH_PAGES = 4;
const DEBUG_CONNECTIONS =
	process.env.LI_DEBUG_CONNECTIONS === "1" || process.env.LI_DEBUG_CONNECTIONS === "true";
const DEBUG_CONNECTIONS_DUMP =
	process.env.LI_DEBUG_CONNECTIONS_DUMP === "1" || process.env.LI_DEBUG_CONNECTIONS_DUMP === "true";
const EXPERIMENTAL_CONNECTIONS_OF_SEARCH_DASH =
	process.env.LI_EXPERIMENTAL_CONNECTIONS_OF_SEARCH_DASH === "1" ||
	process.env.LI_EXPERIMENTAL_CONNECTIONS_OF_SEARCH_DASH === "true";
const PROFILE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;
const DEFAULT_NETWORK_DEGREES: NetworkDegree[] = ["1st", "2nd", "3rd"];
const NETWORK_FILTERS: Record<NetworkDegree, string> = {
	"1st": "F",
	"2nd": "S",
	"3rd": "O",
};

type ProgressReporter = {
	update: (info: { fetched: number; page: number; targetCount: number | null }) => void;
	done: (finalCount: number) => void;
};

type NetworkDegree = "1st" | "2nd" | "3rd";

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
	const client = options.fast
		? new LinkedInClient(credentials, {
				delayMinMs: FAST_DELAY_MIN_MS,
				delayMaxMs: FAST_DELAY_MAX_MS,
				adaptivePacing: true,
			})
		: new LinkedInClient(credentials);
	const start = options.start ?? 0;
	const requestedCount = options.count ?? 20;
	const fetchAll = options.all ?? false;
	const count = fetchAll ? null : Math.max(0, requestedCount);
	const connectionOfIdentifier = options.of?.trim();
	const connectionOfId = connectionOfIdentifier
		? await normalizeConnectionOfIdentifier(client, connectionOfIdentifier)
		: null;
	const networkDegrees = connectionOfId
		? options.network && options.network.length > 0
			? options.network
			: DEFAULT_NETWORK_DEGREES
		: undefined;
	const networkFilters = networkDegrees
		? networkDegrees.map((degree) => NETWORK_FILTERS[degree])
		: undefined;
	const referer = connectionOfId
		? buildConnectionsOfReferer(connectionOfId, 1, networkFilters)
		: FLAGSHIP_CONNECTIONS_REFERER;
	const requestUrl = connectionOfId
		? buildConnectionsOfRequestUrl(connectionOfId, 1, networkFilters)
		: FLAGSHIP_CONNECTIONS_URL;
	const pageBindingRef: { value?: string } = {};
	const buildBody = connectionOfId
		? (startIndex: number, _pageSize: number) =>
				buildConnectionsOfSearchBody(
					startIndex,
					connectionOfId ?? "",
					networkFilters,
					pageBindingRef.value,
				)
		: buildConnectionsPaginationBody;
	const effectiveStart =
		connectionOfId && start > 0
			? Math.floor(start / CONNECTIONS_OF_PAGE_SIZE) * CONNECTIONS_OF_PAGE_SIZE
			: start;
	const skip = connectionOfId ? start - effectiveStart : 0;

	const pageInstance = connectionOfId ? FLAGSHIP_SEARCH_PAGE_INSTANCE : FLAGSHIP_PAGE_INSTANCE;
	const liTrack = buildLiTrackHeader();
	const headers = {
		...buildHeaders(credentials),
		Accept: "*/*",
		"Content-Type": "application/json",
		Origin: "https://www.linkedin.com",
		Referer: referer,
		"X-Li-Page-Instance": pageInstance,
		"X-Li-Track": liTrack,
		...(connectionOfId ? { "X-Li-Rsc-Stream": "true" } : {}),
	};

	const showProgress = Boolean(process.stderr.isTTY) && !options.noProgress;
	const progress = showProgress
		? createProgressReporter({
				targetCount: count,
				label: connectionOfId ? "connections-of" : "connections",
			})
		: null;
	const useExperimentalSearchDash =
		Boolean(connectionOfId) &&
		(options.experimentalSearchDash ?? EXPERIMENTAL_CONNECTIONS_OF_SEARCH_DASH);

	let fetchResult: { connections: NormalizedConnection[]; hitMaxIterations: boolean } = {
		connections: [],
		hitMaxIterations: false,
	};
	try {
		if (useExperimentalSearchDash && connectionOfId) {
			try {
				fetchResult = await fetchConnectionsFromSearchDashClusters(
					client,
					connectionOfId,
					effectiveStart,
					count,
					skip,
					networkFilters,
					progress?.update,
				);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.error(
					`Warning: experimental --of search backend failed (${message}); falling back to default backend.`,
				);
				fetchResult = await fetchConnectionsFromFlagship(
					client,
					requestUrl,
					headers,
					effectiveStart,
					count,
					buildBody,
					skip,
					(startIndex: number) => {
						const page = Math.floor(startIndex / CONNECTIONS_OF_PAGE_SIZE) + 1;
						return {
							url: buildConnectionsOfRequestUrl(connectionOfId, page, networkFilters),
							referer: buildConnectionsOfReferer(connectionOfId, page, networkFilters),
						};
					},
					CONNECTIONS_OF_PAGE_SIZE,
					true,
					progress?.update,
					pageBindingRef,
				);
			}
		} else {
			fetchResult = await fetchConnectionsFromFlagship(
				client,
				requestUrl,
				headers,
				effectiveStart,
				count,
				buildBody,
				skip,
				connectionOfId
					? (startIndex: number) => {
							const page = Math.floor(startIndex / CONNECTIONS_OF_PAGE_SIZE) + 1;
							return {
								url: buildConnectionsOfRequestUrl(connectionOfId, page, networkFilters),
								referer: buildConnectionsOfReferer(connectionOfId, page, networkFilters),
							};
						}
					: undefined,
				connectionOfId ? CONNECTIONS_OF_PAGE_SIZE : undefined,
				Boolean(connectionOfId),
				progress?.update,
				connectionOfId ? pageBindingRef : undefined,
			);
		}
	} finally {
		progress?.done(fetchResult.connections.length);
	}

	if (fetchResult.hitMaxIterations) {
		console.error(
			"Warning: reached max page limit while fetching connections; results may be incomplete.",
		);
	}

	const normalizedConnections = fetchResult.connections;
	const result: ConnectionsResult = {
		connections: normalizedConnections,
		paging: {
			start,
			count: normalizedConnections.length,
			total: null,
		},
	};

	if (options.json) {
		return formatJson(result);
	}

	return formatHumanOutput(result);
}

async function fetchConnectionsFromFlagship(
	client: LinkedInClient,
	requestUrl: string,
	headers: Record<string, string>,
	start: number,
	count: number | null,
	buildBody: (startIndex: number, pageSize: number) => Record<string, unknown>,
	skip = 0,
	buildRequest?: (startIndex: number, pageSize: number) => { url?: string; referer?: string },
	pageStep?: number,
	preferSearchParser = false,
	onProgress?: ProgressReporter["update"],
	pageBindingRef?: { value?: string },
): Promise<{ connections: NormalizedConnection[]; hitMaxIterations: boolean }> {
	const connections: NormalizedConnection[] = [];
	const seen = new Set<string>();
	let currentStart = start;
	let iterations = 0;
	let remainingSkip = Math.max(0, skip);
	let stallPages = 0;
	let emptySearchPages = 0;
	const targetCount = count ?? Number.POSITIVE_INFINITY;
	const estimatedPageSize = pageStep && pageStep > 0 ? pageStep : 50;
	const maxIterations =
		count === null ? 1000 : Math.max(20, Math.ceil(targetCount / estimatedPageSize) + 5);

	while (connections.length < targetCount && iterations < maxIterations) {
		const remaining = targetCount - connections.length;
		const pageSize = Number.isFinite(remaining) ? Math.max(1, Math.min(50, remaining)) : 50;
		const pageIndex = iterations + 1;
		const body = JSON.stringify(buildBody(currentStart, pageSize));
		const requestOverride = buildRequest?.(currentStart, pageSize);
		const effectiveUrl = requestOverride?.url ?? requestUrl;
		const effectiveHeaders = requestOverride?.referer
			? { ...headers, Referer: requestOverride.referer }
			: headers;
		if (DEBUG_CONNECTIONS) {
			const preview = body.length > 2000 ? `${body.slice(0, 2000)}…` : body;
			process.stderr.write(
				`[li][connections] url=${effectiveUrl} start=${currentStart} pageSize=${pageSize} binding=${pageBindingRef?.value ?? "none"} body=${preview}\n`,
			);
		}
		const response = await client.requestAbsolute(effectiveUrl, {
			method: "POST",
			headers: effectiveHeaders,
			body,
		});
		if (DEBUG_CONNECTIONS) {
			process.stderr.write(
				`[li][connections] status=${response.status} ok=${response.ok} url=${effectiveUrl}\n`,
			);
		}

		const buffer = await response.arrayBuffer();
		const payload = new TextDecoder("utf-8").decode(buffer);
		if (pageBindingRef) {
			const bindingMatch = payload.match(
				/currentIndicatorIndexBinding"\s*:\s*\{[\s\S]{0,300}?"value":"(SearchResultsauto-binding-[A-Za-z0-9-]+)"/,
			);
			if (bindingMatch?.[0]) {
				pageBindingRef.value = bindingMatch[1];
				if (DEBUG_CONNECTIONS) {
					process.stderr.write(
						`[li][connections] detectedBinding=${pageBindingRef.value} start=${currentStart}\n`,
					);
				}
			}
		}
		if (DEBUG_CONNECTIONS) {
			const preview = payload.length > 2000 ? `${payload.slice(0, 2000)}…` : payload;
			const peopleMarkerCount = payload.split('viewName":"people-search-result"').length - 1;
			const miniProfileCount = payload.split('"miniProfile"').length - 1;
			const commercialLimit = payload.includes("commercial use limit");
			const authwall = payload.includes("authwall");
			if (DEBUG_CONNECTIONS_DUMP && (peopleMarkerCount === 0 || currentStart <= 10)) {
				try {
					const label = peopleMarkerCount === 0 ? "empty" : "page";
					fs.writeFileSync(`/tmp/li-connections-${label}-${currentStart}.txt`, payload);
				} catch {
					// Best-effort debug dump.
				}
			}
			process.stderr.write(
				`[li][connections] payload_length=${payload.length} peopleMarkers=${peopleMarkerCount} miniProfiles=${miniProfileCount} commercialLimit=${commercialLimit} authwall=${authwall} preview=${preview}\n`,
			);
		}
		let pageConnections: NormalizedConnection[] = [];
		const isHtml = payload.trim().startsWith("<!DOCTYPE");

		if (preferSearchParser) {
			pageConnections = isHtml
				? parseConnectionsFromSearchHtml(payload)
				: parseConnectionsFromSearchStream(payload);
			if (pageConnections.length === 0) {
				if (!isHtml) {
					pageConnections = parseConnectionsFromSearchStream(payload, {
						enforceActionSlots: false,
					});
				}
			}
			if (pageConnections.length === 0) {
				const htmlFallback = parseConnectionsFromSearchHtml(payload);
				pageConnections =
					htmlFallback.length > 0 ? htmlFallback : parseConnectionsFromFlagshipRsc(payload);
			}
		} else {
			pageConnections = isHtml
				? parseConnectionsFromSearchHtml(payload)
				: parseConnectionsFromFlagshipRsc(payload);
			if (pageConnections.length === 0) {
				const searchFallback = parseConnectionsFromSearchHtml(payload);
				pageConnections =
					searchFallback.length > 0 ? searchFallback : parseConnectionsFromSearchStream(payload);
			}
		}

		if (pageConnections.length === 0) {
			if (preferSearchParser) {
				emptySearchPages += 1;
				if (DEBUG_CONNECTIONS) {
					process.stderr.write(
						`[li][connections] parsed=0 emptySearchPages=${emptySearchPages} start=${currentStart}\n`,
					);
				}
				if (emptySearchPages >= MAX_EMPTY_SEARCH_PAGES) {
					break;
				}
				const advanceBy = pageStep && pageStep > 0 ? pageStep : estimatedPageSize;
				currentStart += advanceBy;
				iterations += 1;
				continue;
			}
			break;
		}
		emptySearchPages = 0;
		if (DEBUG_CONNECTIONS) {
			process.stderr.write(
				`[li][connections] parsed=${pageConnections.length} start=${currentStart}\n`,
			);
		}

		let added = 0;
		for (const connection of pageConnections) {
			if (remainingSkip > 0) {
				remainingSkip -= 1;
				continue;
			}
			if (seen.has(connection.username)) {
				continue;
			}
			seen.add(connection.username);
			connections.push(connection);
			added += 1;
			if (connections.length >= targetCount) {
				break;
			}
		}

		if (added === 0 && remainingSkip === 0) {
			stallPages += 1;
			if (DEBUG_CONNECTIONS) {
				process.stderr.write(
					`[li][connections] added=0 stallPages=${stallPages} start=${currentStart}\n`,
				);
			}
			if (stallPages >= MAX_STALL_PAGES) {
				break;
			}
		} else if (added > 0) {
			stallPages = 0;
			if (DEBUG_CONNECTIONS) {
				process.stderr.write(
					`[li][connections] added=${added} total=${connections.length} start=${currentStart}\n`,
				);
			}
		}

		onProgress?.({
			fetched: connections.length,
			page: pageIndex,
			targetCount: count,
		});

		const advanceBy = pageStep && pageStep > 0 ? pageStep : pageConnections.length;
		currentStart += advanceBy;
		iterations += 1;
	}

	return { connections, hitMaxIterations: iterations >= maxIterations };
}

async function fetchConnectionsFromSearchDashClusters(
	client: LinkedInClient,
	connectionOfId: string,
	start: number,
	count: number | null,
	skip: number,
	networkFilters?: string[],
	onProgress?: ProgressReporter["update"],
): Promise<{ connections: NormalizedConnection[]; hitMaxIterations: boolean }> {
	const connections: NormalizedConnection[] = [];
	const seen = new Set<string>();
	const targetCount = count ?? Number.POSITIVE_INFINITY;
	const pageSize = CONNECTIONS_OF_PAGE_SIZE;
	const maxIterations = count === null ? 1000 : Math.max(20, Math.ceil(targetCount / pageSize) + 5);
	let currentStart = start;
	let iterations = 0;
	let remainingSkip = Math.max(0, skip);
	let stallPages = 0;

	while (connections.length < targetCount && iterations < maxIterations) {
		const pageIndex = iterations + 1;
		const requestUrl = buildSearchDashClustersRequestUrl(
			connectionOfId,
			currentStart,
			Math.min(
				pageSize,
				Number.isFinite(targetCount) ? Math.max(1, targetCount - connections.length) : pageSize,
			),
			networkFilters,
		);
		if (DEBUG_CONNECTIONS) {
			process.stderr.write(
				`[li][connections][experimental] url=${requestUrl} start=${currentStart} pageSize=${pageSize}\n`,
			);
		}

		const response = await client.requestAbsolute(requestUrl, {
			method: "GET",
		});
		const payload = (await response.json()) as unknown;
		const pageConnections = parseConnectionsFromSearchDashClustersPayload(payload);

		if (DEBUG_CONNECTIONS) {
			process.stderr.write(
				`[li][connections][experimental] parsed=${pageConnections.length} start=${currentStart}\n`,
			);
		}

		// Treat an empty first page as an endpoint-shape failure and fallback to default backend.
		if (pageConnections.length === 0 && iterations === 0) {
			throw new Error("no parseable search results in first page");
		}
		if (pageConnections.length === 0) {
			break;
		}

		let added = 0;
		for (const connection of pageConnections) {
			if (remainingSkip > 0) {
				remainingSkip -= 1;
				continue;
			}
			if (seen.has(connection.username)) {
				continue;
			}
			seen.add(connection.username);
			connections.push(connection);
			added += 1;
			if (connections.length >= targetCount) {
				break;
			}
		}

		if (added === 0 && remainingSkip === 0) {
			stallPages += 1;
			if (stallPages >= MAX_STALL_PAGES) {
				break;
			}
		} else if (added > 0) {
			stallPages = 0;
		}

		onProgress?.({
			fetched: connections.length,
			page: pageIndex,
			targetCount: count,
		});

		if (pageConnections.length < pageSize) {
			break;
		}
		currentStart += pageSize;
		iterations += 1;
	}

	return {
		connections,
		hitMaxIterations: iterations >= maxIterations,
	};
}

function buildSearchDashClustersRequestUrl(
	connectionOfId: string,
	start: number,
	count: number,
	networkFilters?: string[],
): string {
	const params = new URLSearchParams({
		q: "all",
		start: String(start),
		count: String(count),
		query: buildSearchDashClustersQueryExpression(connectionOfId, networkFilters),
	});
	return `${VOYAGER_SEARCH_DASH_CLUSTERS_URL}?${params.toString()}`;
}

function buildSearchDashClustersQueryExpression(
	connectionOfId: string,
	networkFilters?: string[],
): string {
	const queryParameters = [
		"(key:resultType,value:List(PEOPLE))",
		`(key:connectionOf,value:List(${connectionOfId}))`,
	];
	if (networkFilters && networkFilters.length > 0) {
		queryParameters.push(`(key:network,value:List(${networkFilters.join(",")}))`);
	}
	return `(origin:${CONNECTIONS_OF_ORIGIN},queryParameters:List(${queryParameters.join(
		",",
	)}),includeFiltersInResponse:false)`;
}

function parseConnectionsFromSearchDashClustersPayload(payload: unknown): NormalizedConnection[] {
	const root =
		payload && typeof payload === "object" && !Array.isArray(payload)
			? (payload as Record<string, unknown>)
			: {};
	const included = Array.isArray(root.included) ? root.included : [];
	const connections: NormalizedConnection[] = [];
	const seen = new Set<string>();

	for (const item of included) {
		if (!item || typeof item !== "object" || Array.isArray(item)) {
			continue;
		}
		const entry = item as Record<string, unknown>;
		const miniProfile =
			entry.miniProfile &&
			typeof entry.miniProfile === "object" &&
			!Array.isArray(entry.miniProfile)
				? (entry.miniProfile as Record<string, unknown>)
				: undefined;

		const publicIdentifier =
			readNonEmptyString(entry.publicIdentifier) ??
			readNonEmptyString(miniProfile?.publicIdentifier) ??
			extractProfileUsernameFromUrl(
				readNonEmptyString(entry.navigationUrl) ??
					readNonEmptyString(entry.publicProfileUrl) ??
					readNonEmptyString(miniProfile?.publicProfileUrl) ??
					"",
			);
		if (!publicIdentifier || seen.has(publicIdentifier)) {
			continue;
		}

		const firstName =
			readNonEmptyString(entry.firstName) ?? readNonEmptyString(miniProfile?.firstName) ?? "";
		const lastName =
			readNonEmptyString(entry.lastName) ?? readNonEmptyString(miniProfile?.lastName) ?? "";
		const headline =
			readNonEmptyString(entry.occupation) ??
			readNonEmptyString(entry.headline) ??
			readNestedText(entry.headline) ??
			readNestedText(entry.subline) ??
			"";
		const profileUrl =
			readNonEmptyString(entry.publicProfileUrl) ??
			readNonEmptyString(miniProfile?.publicProfileUrl) ??
			`https://www.linkedin.com/in/${publicIdentifier}`;
		const urn =
			readNonEmptyString(entry.entityUrn) ?? readNonEmptyString(miniProfile?.entityUrn) ?? "";
		const connectionDegree =
			readNonEmptyString(entry.connectionDistance) ??
			readNonEmptyString(entry.distance) ??
			undefined;

		seen.add(publicIdentifier);
		connections.push({
			urn,
			username: publicIdentifier,
			firstName,
			lastName,
			headline,
			profileUrl,
			...(connectionDegree ? { connectionDegree } : {}),
		});
	}

	return connections;
}

function readNonEmptyString(value: unknown): string | undefined {
	if (typeof value !== "string") {
		return undefined;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function readNestedText(value: unknown): string | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return undefined;
	}
	return readNonEmptyString((value as Record<string, unknown>).text);
}

function extractProfileUsernameFromUrl(url: string): string | undefined {
	if (!url) {
		return undefined;
	}
	const match = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
	if (!match?.[1]) {
		return undefined;
	}
	try {
		return decodeURIComponent(match[1]);
	} catch {
		return match[1];
	}
}

function createProgressReporter(options: {
	targetCount: number | null;
	label: string;
}): ProgressReporter {
	const frames = ["|", "/", "-", "\\"];
	const startTime = Date.now();
	let frameIndex = 0;
	let lastLineLength = 0;

	const formatDuration = (ms: number): string => {
		const totalSeconds = Math.max(0, Math.floor(ms / 1000));
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
	};

	const formatRate = (count: number, elapsedMs: number): string => {
		if (elapsedMs <= 0) {
			return "0/min";
		}
		const perMinute = (count / elapsedMs) * 60_000;
		if (perMinute >= 1000) {
			return `${(perMinute / 1000).toFixed(1)}k/min`;
		}
		return `${Math.round(perMinute)}/min`;
	};

	const writeLine = (line: string) => {
		const padded = line.length < lastLineLength ? line.padEnd(lastLineLength, " ") : line;
		lastLineLength = padded.length;
		process.stderr.write(`\r${padded}`);
	};

	return {
		update: ({ fetched, page, targetCount }) => {
			const elapsed = Date.now() - startTime;
			const frame = frames[frameIndex % frames.length];
			frameIndex += 1;
			const hasTarget = Boolean(targetCount && Number.isFinite(targetCount));
			const target = hasTarget ? `/${targetCount}` : "";
			const percent =
				hasTarget && targetCount
					? ` (${Math.min(100, Math.floor((fetched / targetCount) * 100))}%)`
					: "";
			writeLine(
				`${frame} fetching ${options.label} ${fetched}${target}${percent} · page ${page} · ${formatRate(
					fetched,
					elapsed,
				)} · ${formatDuration(elapsed)}`,
			);
		},
		done: (finalCount: number) => {
			const elapsed = Date.now() - startTime;
			const hasTarget = Boolean(options.targetCount && Number.isFinite(options.targetCount));
			const target = hasTarget ? `/${options.targetCount}` : "";
			const percent =
				hasTarget && options.targetCount
					? ` (${Math.min(100, Math.floor((finalCount / options.targetCount) * 100))}%)`
					: "";
			writeLine(
				`fetched ${options.label} ${finalCount}${target}${percent} · ${formatRate(
					finalCount,
					elapsed,
				)} · ${formatDuration(elapsed)}`,
			);
			process.stderr.write("\n");
		},
	};
}

function buildConnectionsPaginationBody(
	startIndex: number,
	_pageSize: number,
): Record<string, unknown> {
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

const PROFILE_ID_PATTERN = /^ACo[A-Za-z0-9_-]+$/;

async function normalizeConnectionOfIdentifier(
	client: LinkedInClient,
	identifier: string,
): Promise<string> {
	const parsed = parseLinkedInUrl(identifier);
	if (!parsed || parsed.type !== "profile") {
		throw new Error(
			`Invalid --of value: ${identifier}. Provide a profile username, profile URL, or profile URN.`,
		);
	}

	const trimmedIdentifier = parsed.identifier.trim();
	const value = trimmedIdentifier.startsWith("urn:li:")
		? extractIdFromUrn(trimmedIdentifier).trim()
		: trimmedIdentifier;

	if (!value || !PROFILE_IDENTIFIER_PATTERN.test(value)) {
		throw new Error(
			`Invalid --of value: ${identifier}. Provide a profile username, profile URL, or profile URN.`,
		);
	}

	if (trimmedIdentifier.startsWith("urn:li:") || PROFILE_ID_PATTERN.test(value)) {
		return value;
	}

	const resolved = await resolveRecipient(client, identifier);
	const resolvedId = extractIdFromUrn(resolved.urn).trim();
	if (!resolvedId || !PROFILE_IDENTIFIER_PATTERN.test(resolvedId)) {
		throw new Error(
			`Could not resolve --of value: ${identifier}. Provide a profile username, profile URL, or profile URN.`,
		);
	}

	return resolvedId;
}

function buildConnectionsOfQuery(
	connectionOfId: string,
	page = 1,
	networkFilters?: string[],
): URLSearchParams {
	const params = new URLSearchParams({
		origin: CONNECTIONS_OF_ORIGIN,
		connectionOf: JSON.stringify(connectionOfId),
		spellCorrectionEnabled: "true",
	});
	if (networkFilters && networkFilters.length > 0) {
		params.set("network", JSON.stringify(networkFilters));
	}
	if (page > 1) {
		params.set("page", String(page));
	}
	return params;
}

function buildConnectionsOfRequestUrl(
	connectionOfId: string,
	page = 1,
	networkFilters?: string[],
): string {
	const params = buildConnectionsOfQuery(connectionOfId, page, networkFilters);
	return `${FLAGSHIP_CONNECTIONS_OF_URL}?${params.toString()}`;
}

function buildConnectionsOfReferer(
	connectionOfId: string,
	page = 1,
	networkFilters?: string[],
): string {
	const params = buildConnectionsOfQuery(connectionOfId, page, networkFilters);
	return `https://www.linkedin.com/search/results/people/?${params.toString()}`;
}

function buildConnectionsOfSearchPath(
	connectionOfId: string,
	page = 1,
	networkFilters?: string[],
): string {
	const params = buildConnectionsOfQuery(connectionOfId, page, networkFilters);
	return `/search/results/people/?${params.toString()}`;
}

function buildConnectionsOfSearchBody(
	startIndex: number,
	connectionOfId: string,
	networkFilters?: string[],
	pageBindingKey?: string,
): Record<string, unknown> {
	const pageIndex = Math.floor(startIndex / CONNECTIONS_OF_PAGE_SIZE);
	const page = pageIndex + 1;
	const pageKey = pageBindingKey ?? `SearchResultsauto-binding-${page}`;
	const pageStateValue = page;
	const pageForPath = pageBindingKey ? 1 : page;
	const networkFilter =
		networkFilters && networkFilters.length > 0
			? { filterKey: "network", filterList: networkFilters }
			: { filterKey: "network" };

	return {
		$type: "proto.sdui.actions.core.NavigateToScreen",
		screenId: "com.linkedin.sdui.flagshipnav.search.SearchResultsPeople",
		pageKey: "search_srp_people",
		presentationStyle: "PresentationStyle_FULL_PAGE",
		presentation: {
			$case: "fullPage",
			fullPage: {
				$type: "proto.sdui.actions.core.presentation.FullPagePresentation",
			},
		},
		title: "Search",
		newHierarchy: {
			$type: "proto.sdui.navigation.ScreenHierarchy",
			screenHash: "com.linkedin.sdui.flagshipnav.home.Home#0",
			screenId: "com.linkedin.sdui.flagshipnav.home.Home",
			pageKey: "",
			isAnchorPage: false,
			childHierarchy: {
				$type: "proto.sdui.navigation.ScreenHierarchy",
				screenHash: "com.linkedin.sdui.flagshipnav.search.SearchResults#0",
				screenId: "com.linkedin.sdui.flagshipnav.search.SearchResults",
				pageKey: "",
				isAnchorPage: false,
				childHierarchy: {
					$type: "proto.sdui.navigation.ScreenHierarchy",
					screenHash: "com.linkedin.sdui.flagshipnav.search.SearchResultsPeople#0",
					screenId: "com.linkedin.sdui.flagshipnav.search.SearchResultsPeople",
					pageKey: "",
					isAnchorPage: false,
					url: "",
				},
				url: "",
			},
			url: "",
		},
		url: buildConnectionsOfSearchPath(connectionOfId, pageForPath, networkFilters),
		inheritActor: false,
		colorScheme: "ColorScheme_UNKNOWN",
		disableScreenGutters: false,
		shouldHideMobileTopNavBar: true,
		shouldHideLoadingSpinner: false,
		screenTitle: ["Search"],
		replaceCurrentScreen: false,
		shouldHideMobileTopNavBarDivider: false,
		requestedArguments: {
			payload: {
				origin: CONNECTIONS_OF_ORIGIN,
				network: [networkFilter],
				geoUrn: [{ filterKey: "geoUrn" }],
				activelyHiringForJobTitles: [{ filterKey: "-100" }],
				companyHQBingGeo: [{ filterKey: "companyHQBingGeo" }],
				companySizeV2: [{ filterKey: "companySizeV2" }],
				functionV2: [{ filterKey: "functionV2" }],
				seniorityV2: [{ filterKey: "seniorityV2" }],
				openToVolunteer: [{ filterKey: "openToVolunteer" }],
				firstName: [{ filterKey: "firstName" }],
				lastName: [{ filterKey: "firstName" }],
				title: [{ filterKey: "firstName" }],
				company: [{ filterKey: "firstName" }],
				schoolFreetext: [{ filterKey: "firstName" }],
				currentCompany: [{ filterKey: "currentCompany" }],
				industry: [{ filterKey: "industry" }],
				schoolFilter: [{ filterKey: "schoolFilter" }],
				connectionOf: [
					{
						filterKey: "connectionOf",
						filterItemSingle: connectionOfId,
					},
				],
				pastCompany: [{ filterKey: "pastCompany" }],
				followerOf: [{ filterKey: "followerOf" }],
				serviceCategory: [{ filterKey: "serviceCategory" }],
				profileLanguage: [{ filterKey: "profileLanguage" }],
				eventAttending: [{ filterKey: "eventAttending" }],
				page: [
					{
						pageField: {
							type: "com.linkedin.sdui.components.core.BindingImpl",
							value: {
								key: pageKey,
								namespace: "MemoryNamespace",
							},
						},
					},
				],
				spellCorrectionEnabled: true,
			},
			requestedStateKeys: [
				{
					$type: "proto.sdui.StateKey",
					value: pageKey,
					key: {
						$type: "proto.sdui.Key",
						value: { $case: "id", id: pageKey },
					},
					namespace: "MemoryNamespace",
					isEncrypted: false,
				},
			],
			states: [
				{
					key: pageKey,
					namespace: "MemoryNamespace",
					value: pageStateValue,
					originalProtoCase: "intValue",
				},
			],
			requestMetadata: { $type: "proto.sdui.common.RequestMetadata" },
			screenId: "",
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
	const end = start + count;
	lines.push(`${formatPagination(start, end, total)} connections`);

	return lines.join("\n");
}
