/**
 * Connections command - List your LinkedIn connections.
 * Supports pagination with --start and --count options.
 */

import type { LinkedInCredentials } from "../lib/auth.js";
import { LinkedInClient } from "../lib/client.js";
import { buildHeaders } from "../lib/headers.js";
import {
	parseConnectionsFromFlagshipRsc,
	parseConnectionsFromSearchHtml,
	parseConnectionsFromSearchStream,
} from "../lib/parser.js";
import { resolveRecipient } from "../lib/recipient.js";
import type { NormalizedConnection } from "../lib/types.js";
import { extractIdFromUrn } from "../lib/url-parser.js";
import { formatConnection, formatPagination } from "../output/human.js";
import { formatJson } from "../output/json.js";

export interface ConnectionsOptions {
	json?: boolean;
	start?: number;
	count?: number;
	all?: boolean;
	of?: string;
	fast?: boolean;
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
const FLAGSHIP_CONNECTIONS_REFERER =
	"https://www.linkedin.com/mynetwork/invite-connect/connections/";
const FLAGSHIP_PAGE_INSTANCE =
	"urn:li:page:d_flagship3_people_connections;fkBHD5OCSzq7lUUo2+5Oiw==";
const FLAGSHIP_SEARCH_PAGE_INSTANCE =
	"urn:li:page:d_flagship3_search_srp_people;4GLXsZt9SMWi+zWnoT3o9w==";
const FLAGSHIP_TRACK =
	'{"clientVersion":"0.2.3802","mpVersion":"0.2.3802","osName":"web","timezoneOffset":-5,"timezone":"America/New_York","deviceFormFactor":"DESKTOP","mpName":"web","displayDensity":2,"displayWidth":3024,"displayHeight":1964}';
const CONNECTIONS_OF_PAGE_SIZE = 10;
const FAST_DELAY_MIN_MS = 200;
const FAST_DELAY_MAX_MS = 600;
const DEBUG_CONNECTIONS =
	process.env.LI_DEBUG_CONNECTIONS === "1" || process.env.LI_DEBUG_CONNECTIONS === "true";
const DEBUG_CONNECTIONS_DUMP =
	process.env.LI_DEBUG_CONNECTIONS_DUMP === "1" ||
	process.env.LI_DEBUG_CONNECTIONS_DUMP === "true";
const DISABLE_PROGRESS =
	process.env.LI_NO_PROGRESS === "1" || process.env.LI_NO_PROGRESS === "true";

type ProgressReporter = {
	update: (info: { fetched: number; page: number; targetCount: number | null }) => void;
	done: (finalCount: number) => void;
};

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
	const connectionOf = connectionOfIdentifier
		? await resolveRecipient(client, connectionOfIdentifier)
		: null;
	const connectionOfId = connectionOf ? extractIdFromUrn(connectionOf.urn) : null;
	const referer = connectionOfId
		? buildConnectionsOfReferer(connectionOfId, 1)
		: FLAGSHIP_CONNECTIONS_REFERER;
	const requestUrl = connectionOfId
		? buildConnectionsOfRequestUrl(connectionOfId, 1)
		: FLAGSHIP_CONNECTIONS_URL;
	const buildBody = connectionOf
		? (startIndex: number, _pageSize: number) =>
				buildConnectionsOfSearchBody(startIndex, connectionOfId ?? "")
		: buildConnectionsPaginationBody;
	const effectiveStart =
		connectionOfId && start > 0
			? Math.floor(start / CONNECTIONS_OF_PAGE_SIZE) * CONNECTIONS_OF_PAGE_SIZE
			: start;
	const skip = connectionOfId ? start - effectiveStart : 0;

	const pageInstance = connectionOfId ? FLAGSHIP_SEARCH_PAGE_INSTANCE : FLAGSHIP_PAGE_INSTANCE;
	const headers = {
		...buildHeaders(credentials),
		Accept: "*/*",
		"Content-Type": "application/json",
		Origin: "https://www.linkedin.com",
		Referer: referer,
		"X-Li-Page-Instance": pageInstance,
		"X-Li-Track": FLAGSHIP_TRACK,
		...(connectionOfId ? { "X-Li-Rsc-Stream": "true" } : {}),
	};

	const showProgress =
		!options.json && Boolean(process.stderr.isTTY) && !DISABLE_PROGRESS;
	const progress = showProgress
		? createProgressReporter({
				targetCount: count,
				label: connectionOfId ? "connections-of" : "connections",
			})
		: null;

	let normalizedConnections: NormalizedConnection[] = [];
	try {
		normalizedConnections = await fetchConnectionsFromFlagship(
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
							url: buildConnectionsOfRequestUrl(connectionOfId, page),
							referer: buildConnectionsOfReferer(connectionOfId, page),
						};
					}
				: undefined,
			connectionOfId ? CONNECTIONS_OF_PAGE_SIZE : undefined,
			Boolean(connectionOfId),
			progress?.update,
		);
	} finally {
		progress?.done(normalizedConnections.length);
	}

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
): Promise<NormalizedConnection[]> {
	const connections: NormalizedConnection[] = [];
	const seen = new Set<string>();
	let currentStart = start;
	let iterations = 0;
	let remainingSkip = Math.max(0, skip);
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
				`[li][connections] url=${effectiveUrl} start=${currentStart} pageSize=${pageSize} body=${preview}\n`,
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
		if (DEBUG_CONNECTIONS_DUMP) {
			const dumpPath = `/tmp/li-connections-of-${currentStart}.txt`;
			try {
				await import("node:fs").then(({ writeFileSync }) =>
					writeFileSync(dumpPath, payload, "utf8"),
				);
				process.stderr.write(`[li][connections] dump=${dumpPath}\n`);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				process.stderr.write(`[li][connections] dump_error=${message}\n`);
			}
		}
		if (DEBUG_CONNECTIONS) {
			const preview = payload.length > 2000 ? `${payload.slice(0, 2000)}…` : payload;
			process.stderr.write(
				`[li][connections] payload_length=${payload.length} preview=${preview}\n`,
			);
		}
		let pageConnections: NormalizedConnection[] = [];
		const isHtml = payload.trim().startsWith("<!DOCTYPE");

		if (preferSearchParser) {
			pageConnections = isHtml
				? parseConnectionsFromSearchHtml(payload)
				: parseConnectionsFromSearchStream(payload);
			if (pageConnections.length === 0) {
				const htmlFallback = parseConnectionsFromSearchHtml(payload);
				pageConnections = htmlFallback.length > 0 ? htmlFallback : parseConnectionsFromFlagshipRsc(payload);
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

		if (added === 0) {
			break;
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

	return connections;
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
			const target =
				targetCount && Number.isFinite(targetCount) ? `/${targetCount}` : "";
			writeLine(
				`${frame} fetching ${options.label} ${fetched}${target} · page ${page} · ${formatRate(
					fetched,
					elapsed,
				)} · ${formatDuration(elapsed)}`,
			);
		},
		done: (finalCount: number) => {
			const elapsed = Date.now() - startTime;
			writeLine(
				`fetched ${options.label} ${finalCount} · ${formatRate(
					finalCount,
					elapsed,
				)} · ${formatDuration(elapsed)}`,
			);
			process.stderr.write("\n");
		},
	};
}

function buildConnectionsPaginationBody(startIndex: number, _pageSize: number): Record<string, unknown> {
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

function buildConnectionsOfQuery(connectionOfId: string, page = 1): URLSearchParams {
	const params = new URLSearchParams({
		origin: "FACETED_SEARCH",
		connectionOf: `"${connectionOfId}"`,
		spellCorrectionEnabled: "true",
	});
	if (page > 1) {
		params.set("page", String(page));
	}
	return params;
}

function buildConnectionsOfRequestUrl(connectionOfId: string, page = 1): string {
	const params = buildConnectionsOfQuery(connectionOfId, page);
	return `${FLAGSHIP_CONNECTIONS_OF_URL}?${params.toString()}`;
}

function buildConnectionsOfReferer(connectionOfId: string, page = 1): string {
	const params = buildConnectionsOfQuery(connectionOfId, page);
	return `https://www.linkedin.com/search/results/people/?${params.toString()}`;
}

function buildConnectionsOfSearchPath(connectionOfId: string, page = 1): string {
	const params = buildConnectionsOfQuery(connectionOfId, page);
	return `/search/results/people/?${params.toString()}`;
}

function buildConnectionsOfSearchBody(startIndex: number, connectionOfId: string): Record<string, unknown> {
	const page = Math.floor(startIndex / CONNECTIONS_OF_PAGE_SIZE) + 1;
	const pageKey = `SearchResultsauto-binding-${page}`;

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
		url: buildConnectionsOfSearchPath(connectionOfId, page),
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
				origin: "FACETED_SEARCH",
				network: [{ filterKey: "network" }],
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
			states: [
				{
					key: pageKey,
					namespace: "MemoryNamespace",
					value: page,
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
