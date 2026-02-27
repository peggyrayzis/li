/**
 * Search command - Search LinkedIn people profiles.
 * Uses flagship people-search endpoint with stream/html parser fallbacks.
 */

import type { LinkedInCredentials } from "../lib/auth.js";
import { LinkedInClient } from "../lib/client.js";
import { buildHeaders } from "../lib/headers.js";
import { buildLiTrackHeader } from "../lib/li-track.js";
import {
	parseConnectionsFromFlagshipRsc,
	parseConnectionsFromSearchHtml,
	parseConnectionsFromSearchStream,
} from "../lib/parser.js";
import type { NormalizedConnection } from "../lib/types.js";
import { formatConnection, formatPagination } from "../output/human.js";
import { formatJson } from "../output/json.js";

export interface SearchOptions {
	query: string;
	json?: boolean;
	count?: number;
	all?: boolean;
	fast?: boolean;
	noProgress?: boolean;
}

interface SearchResult {
	query: string;
	limitApplied: number;
	connections: NormalizedConnection[];
	paging: {
		total: number | null;
		count: number;
		start: number;
	};
}

type ProgressReporter = {
	update: (info: { fetched: number; page: number; targetCount: number | null }) => void;
	done: (finalCount: number) => void;
};

const FLAGSHIP_SEARCH_URL = "https://www.linkedin.com/flagship-web/search/results/people/";
const FLAGSHIP_SEARCH_PAGE_INSTANCE =
	"urn:li:page:d_flagship3_search_srp_people;4GLXsZt9SMWi+zWnoT3o9w==";
const SEARCH_ORIGIN = "GLOBAL_SEARCH_HEADER";
const DEFAULT_COUNT = 20;
const MAX_COUNT = 50;
const SEARCH_PAGE_SIZE = 10;
const FAST_DELAY_MIN_MS = 200;
const FAST_DELAY_MAX_MS = 600;
const MAX_STALL_PAGES = 3;
const MAX_EMPTY_SEARCH_PAGES = 4;

export async function search(
	credentials: LinkedInCredentials,
	options: SearchOptions,
): Promise<string> {
	const query = options.query?.trim();
	if (!query) {
		throw new Error("Invalid --query value: search query text is required.");
	}

	const client = options.fast
		? new LinkedInClient(credentials, {
				delayMinMs: FAST_DELAY_MIN_MS,
				delayMaxMs: FAST_DELAY_MAX_MS,
				adaptivePacing: true,
			})
		: new LinkedInClient(credentials);

	const rawRequestedCount = Number.isFinite(options.count ?? NaN)
		? Math.floor(options.count as number)
		: DEFAULT_COUNT;
	const safeRequestedCount = Math.max(0, rawRequestedCount);
	const limitApplied = Math.min(MAX_COUNT, options.all ? MAX_COUNT : safeRequestedCount);
	const pageBindingRef: { value?: string } = {};
	const liTrack = buildLiTrackHeader();
	const headers = {
		...buildHeaders(credentials),
		Accept: "*/*",
		"Content-Type": "application/json",
		Origin: "https://www.linkedin.com",
		Referer: buildSearchReferer(query, 1),
		"X-Li-Page-Instance": FLAGSHIP_SEARCH_PAGE_INSTANCE,
		"X-Li-Track": liTrack,
		"X-Li-Rsc-Stream": "true",
	};

	const showProgress = Boolean(process.stderr.isTTY) && !options.noProgress;
	const progress = showProgress
		? createProgressReporter({
				targetCount: limitApplied,
				label: "search results",
			})
		: null;

	let fetchResult: { connections: NormalizedConnection[]; hitMaxIterations: boolean } = {
		connections: [],
		hitMaxIterations: false,
	};
	try {
		fetchResult = await fetchSearchFromFlagship(
			client,
			buildSearchRequestUrl(query, 1),
			headers,
			limitApplied,
			(startIndex: number, _pageSize: number) =>
				buildSearchBody(startIndex, query, pageBindingRef.value),
			(startIndex: number) => {
				const page = Math.floor(startIndex / SEARCH_PAGE_SIZE) + 1;
				return {
					url: buildSearchRequestUrl(query, page),
					referer: buildSearchReferer(query, page),
				};
			},
			SEARCH_PAGE_SIZE,
			progress?.update,
			pageBindingRef,
		);
	} finally {
		progress?.done(fetchResult.connections.length);
	}

	const result: SearchResult = {
		query,
		limitApplied,
		connections: fetchResult.connections,
		paging: {
			start: 0,
			count: fetchResult.connections.length,
			total: null,
		},
	};

	if (options.json) {
		return formatJson(result);
	}

	return formatHumanOutput(result);
}

async function fetchSearchFromFlagship(
	client: LinkedInClient,
	requestUrl: string,
	headers: Record<string, string>,
	targetCount: number,
	buildBody: (startIndex: number, pageSize: number) => Record<string, unknown>,
	buildRequest?: (startIndex: number, pageSize: number) => { url?: string; referer?: string },
	pageStep?: number,
	onProgress?: ProgressReporter["update"],
	pageBindingRef?: { value?: string },
): Promise<{ connections: NormalizedConnection[]; hitMaxIterations: boolean }> {
	const connections: NormalizedConnection[] = [];
	const seen = new Set<string>();
	const effectiveTarget = Math.max(0, targetCount);
	const estimatedPageSize = pageStep && pageStep > 0 ? pageStep : SEARCH_PAGE_SIZE;
	const maxIterations = Math.max(
		20,
		Math.ceil(Math.max(1, effectiveTarget) / estimatedPageSize) + 5,
	);

	let currentStart = 0;
	let iterations = 0;
	let stallPages = 0;
	let emptySearchPages = 0;

	while (connections.length < effectiveTarget && iterations < maxIterations) {
		const remaining = effectiveTarget - connections.length;
		const pageSize = Math.max(1, Math.min(MAX_COUNT, remaining));
		const pageIndex = iterations + 1;
		const body = JSON.stringify(buildBody(currentStart, pageSize));
		const requestOverride = buildRequest?.(currentStart, pageSize);
		const effectiveUrl = requestOverride?.url ?? requestUrl;
		const effectiveHeaders = requestOverride?.referer
			? { ...headers, Referer: requestOverride.referer }
			: headers;

		const response = await client.requestAbsolute(effectiveUrl, {
			method: "POST",
			headers: effectiveHeaders,
			body,
		});

		const buffer = await response.arrayBuffer();
		const payload = new TextDecoder("utf-8").decode(buffer);

		if (pageBindingRef) {
			const bindingMatch = payload.match(
				/currentIndicatorIndexBinding"\s*:\s*\{[\s\S]{0,300}?"value":"(SearchResultsauto-binding-[A-Za-z0-9-]+)"/,
			);
			if (bindingMatch?.[1]) {
				pageBindingRef.value = bindingMatch[1];
			}
		}

		const pageConnections = parseSearchConnections(payload);
		if (pageConnections.length === 0) {
			if (connections.length === 0) {
				break;
			}
			emptySearchPages += 1;
			if (emptySearchPages >= MAX_EMPTY_SEARCH_PAGES) {
				break;
			}
			currentStart += estimatedPageSize;
			iterations += 1;
			continue;
		}
		emptySearchPages = 0;

		let added = 0;
		for (const connection of pageConnections) {
			if (!connection.username || seen.has(connection.username)) {
				continue;
			}
			seen.add(connection.username);
			connections.push(connection);
			added += 1;
			if (connections.length >= effectiveTarget) {
				break;
			}
		}

		if (added === 0) {
			stallPages += 1;
			if (stallPages >= MAX_STALL_PAGES) {
				break;
			}
		} else {
			stallPages = 0;
		}

		onProgress?.({
			fetched: connections.length,
			page: pageIndex,
			targetCount: effectiveTarget,
		});

		currentStart += estimatedPageSize;
		iterations += 1;
	}

	return {
		connections,
		hitMaxIterations: iterations >= maxIterations,
	};
}

function parseSearchConnections(payload: string): NormalizedConnection[] {
	const isHtml = payload.trim().startsWith("<!DOCTYPE");
	let pageConnections = isHtml
		? parseConnectionsFromSearchHtml(payload)
		: parseConnectionsFromSearchStream(payload);

	if (pageConnections.length === 0 && !isHtml) {
		pageConnections = parseConnectionsFromSearchStream(payload, {
			enforceActionSlots: false,
		});
	}

	if (pageConnections.length === 0) {
		const htmlFallback = parseConnectionsFromSearchHtml(payload);
		pageConnections =
			htmlFallback.length > 0 ? htmlFallback : parseConnectionsFromFlagshipRsc(payload);
	}

	return pageConnections;
}

function buildSearchQuery(query: string, page = 1): URLSearchParams {
	const params = new URLSearchParams({
		origin: SEARCH_ORIGIN,
		keywords: query,
		spellCorrectionEnabled: "true",
	});
	if (page > 1) {
		params.set("page", String(page));
	}
	return params;
}

function buildSearchRequestUrl(query: string, page = 1): string {
	const params = buildSearchQuery(query, page);
	return `${FLAGSHIP_SEARCH_URL}?${params.toString()}`;
}

function buildSearchReferer(query: string, page = 1): string {
	const params = buildSearchQuery(query, page);
	return `https://www.linkedin.com/search/results/people/?${params.toString()}`;
}

function buildSearchPath(query: string, page = 1): string {
	const params = buildSearchQuery(query, page);
	return `/search/results/people/?${params.toString()}`;
}

function buildSearchBody(
	startIndex: number,
	query: string,
	pageBindingKey?: string,
): Record<string, unknown> {
	const pageIndex = Math.floor(startIndex / SEARCH_PAGE_SIZE);
	const page = pageIndex + 1;
	const pageKey = pageBindingKey ?? `SearchResultsauto-binding-${page}`;
	const pageStateValue = page;
	const pageForPath = pageBindingKey ? 1 : page;

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
		url: buildSearchPath(query, pageForPath),
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
				origin: SEARCH_ORIGIN,
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
				keywords: [
					{
						filterKey: "keywords",
						filterItemSingle: query,
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

function formatHumanOutput(result: SearchResult): string {
	if (result.connections.length === 0) {
		return "No connections found.";
	}

	const lines: string[] = [];

	for (const connection of result.connections) {
		lines.push(formatConnection(connection));
		lines.push("");
	}

	const { start, count, total } = result.paging;
	const end = start + count;
	lines.push(`${formatPagination(start, end, total)} results`);

	return lines.join("\n");
}
