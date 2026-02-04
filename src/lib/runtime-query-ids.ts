import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { LinkedInClient } from "./client.js";
import { buildWebHeaders } from "./headers.js";

export interface QueryIdSnapshot {
	fetchedAt: string;
	ids: Record<string, string>;
	discovery?: {
		harPath?: string;
	};
	headers?: Record<string, string>;
	variables?: Record<string, string>;
}

export interface QueryIdSnapshotInfo {
	cachePath: string;
	snapshot: QueryIdSnapshot;
	ageMs: number;
	isFresh: boolean;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function getDefaultCacheDir(): string {
	if (process.platform === "win32") {
		const base = process.env.LOCALAPPDATA ?? process.env.APPDATA ?? os.homedir();
		return path.join(base, "li");
	}
	if (process.platform === "darwin") {
		return path.join(os.homedir(), "Library", "Caches", "li");
	}
	const base = process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), ".cache");
	return path.join(base, "li");
}

const DEFAULT_CACHE_PATH = path.join(getDefaultCacheDir(), "query-ids.json");

function getCachePath(): string {
	return process.env.LINKEDIN_QUERY_ID_CACHE_PATH || DEFAULT_CACHE_PATH;
}

function ensureCacheDir(cachePath: string): void {
	const dir = path.dirname(cachePath);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true, mode: 0o700 });
	}
}

function lockDownFile(pathname: string): void {
	try {
		chmodSync(pathname, 0o600);
	} catch {
		// Ignore chmod failures (e.g., unsupported filesystem).
	}
}

function extractQueryIdFromHar(harPath: string, operation: string): string | null {
	if (!existsSync(harPath)) {
		return null;
	}
	const raw = readFileSync(harPath, "utf8");
	const parsed = JSON.parse(raw) as {
		log?: { entries?: Array<{ request?: { url?: string } }> };
	};
	const entries = parsed.log?.entries ?? [];
	for (const entry of entries) {
		const url = entry.request?.url ?? "";
		if (!url.includes("voyagerMessagingGraphQL/graphql")) {
			continue;
		}
		if (!url.includes(operation)) {
			continue;
		}
		const query = url.split("?")[1] ?? "";
		const params = new URLSearchParams(query);
		const queryId = params.get("queryId");
		if (queryId) {
			return queryId;
		}
	}
	return null;
}

function extractVariablesFromHar(harPath: string, operation: string): string | null {
	if (!existsSync(harPath)) {
		return null;
	}
	const raw = readFileSync(harPath, "utf8");
	const parsed = JSON.parse(raw) as {
		log?: { entries?: Array<{ request?: { url?: string } }> };
	};
	const entries = parsed.log?.entries ?? [];
	for (const entry of entries) {
		const url = entry.request?.url ?? "";
		if (!url.includes("voyagerMessagingGraphQL/graphql")) {
			continue;
		}
		if (!url.includes(operation)) {
			continue;
		}
		const query = url.split("?")[1] ?? "";
		const params = new URLSearchParams(query);
		const variables = params.get("variables");
		if (variables) {
			return variables;
		}
	}
	return null;
}

function extractHeadersFromHar(harPath: string, operation: string): Record<string, string> | null {
	if (!existsSync(harPath)) {
		return null;
	}
	const raw = readFileSync(harPath, "utf8");
	const parsed = JSON.parse(raw) as {
		log?: {
			entries?: Array<{
				request?: { url?: string; headers?: Array<{ name: string; value: string }> };
			}>;
		};
	};
	const entries = parsed.log?.entries ?? [];
	for (const entry of entries) {
		const url = entry.request?.url ?? "";
		if (!url.includes("voyagerMessagingGraphQL/graphql")) {
			continue;
		}
		if (!url.includes(operation)) {
			continue;
		}
		const headers = entry.request?.headers ?? [];
		const selected: Record<string, string> = {};
		for (const header of headers) {
			const name = header.name.toLowerCase();
			if (
				name === "x-li-page-instance" ||
				name === "x-li-track" ||
				name === "x-li-lang" ||
				name === "x-li-graphql-token"
			) {
				selected[header.name] = header.value;
			}
		}
		return Object.keys(selected).length > 0 ? selected : null;
	}
	return null;
}

async function readSnapshot(cachePath: string): Promise<QueryIdSnapshot | null> {
	if (!existsSync(cachePath)) {
		return null;
	}
	const raw = readFileSync(cachePath, "utf8");
	return JSON.parse(raw) as QueryIdSnapshot;
}

async function writeSnapshot(cachePath: string, snapshot: QueryIdSnapshot): Promise<void> {
	ensureCacheDir(cachePath);
	writeFileSync(cachePath, `${JSON.stringify(snapshot, null, 2)}\n`, {
		encoding: "utf8",
		mode: 0o600,
	});
	lockDownFile(cachePath);
}

const LINKEDIN_ENTRYPOINTS = [
	"https://www.linkedin.com/messaging/",
	"https://www.linkedin.com/messaging",
	"https://www.linkedin.com/feed/",
	"https://www.linkedin.com/feed",
];

// biome-ignore lint: escaped slashes are clearer via String.raw
const BUNDLE_URL_REGEX = new RegExp(
	String.raw`https:\\/\\/static(?:-exp[0-9]+)?\.licdn\.com\\/[^"'\s]+?\.js`,
	"g",
);
const SCRIPT_SRC_REGEX = /<script[^>]+src=["']([^"']+)["']/gi;
const JSON_SCRIPT_REGEX = /<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;
const LINK_HREF_REGEX = /<link[^>]+href=["']([^"']+)["']/gi;
// biome-ignore lint: escaped slashes are clearer via String.raw
const BUNDLE_URL_ESCAPED_REGEX = new RegExp(String.raw`https:\\\/\\\/[^"\s]+?\.js`, "g");
// biome-ignore lint: escaped slashes are clearer via String.raw
const BUNDLE_URL_UNICODE_REGEX = new RegExp(String.raw`https:\\u002F\\u002F[^"\s]+?\.js`, "g");
// biome-ignore lint: escaped slashes are clearer via String.raw
const BUNDLE_RELATIVE_REGEX = new RegExp(
	String.raw`"(\\/?(?:aero-v1|assets|sc)\\/[^"']+?\.js)"`,
	"g",
);
const DEBUG_QUERY_IDS =
	process.env.LI_DEBUG_QUERY_IDS === "1" || process.env.LI_DEBUG_QUERY_IDS === "true";

function debugQueryIds(message: string): void {
	if (!DEBUG_QUERY_IDS) {
		return;
	}
	process.stderr.write(`[li][query-ids] ${message}\n`);
}

function unescapeBundleUrl(url: string): string {
	return url.replace(/\\u002F/g, "/").replace(/\\\//g, "/");
}

function extractBundleUrlsFromHtml(html: string): string[] {
	const bundles = new Set<string>();
	if (DEBUG_QUERY_IDS) {
		const licdnCount = (html.match(/licdn\\.com/g) || []).length;
		const jsCount = (html.match(/\\.js/g) || []).length;
		const scriptCount = (html.match(/<script/gi) || []).length;
		const srcCount = (html.match(/src=/gi) || []).length;
		const linkCount = (html.match(/<link/gi) || []).length;
		const dataJsCount = (html.match(/javascript/gi) || []).length;
		const aeroCount = (html.match(/aero-v1/gi) || []).length;
		const staticCount = (html.match(/static/gi) || []).length;
		debugQueryIds(
			`entrypoint licdn=${licdnCount} js=${jsCount} script=${scriptCount} src=${srcCount} link=${linkCount} jsword=${dataJsCount} aero=${aeroCount} static=${staticCount}`,
		);
	}
	for (const match of html.matchAll(BUNDLE_URL_REGEX)) {
		bundles.add(match[0]);
	}
	for (const match of html.matchAll(BUNDLE_URL_ESCAPED_REGEX)) {
		const url = unescapeBundleUrl(match[0]);
		if (url.includes("licdn.com")) {
			bundles.add(url);
		}
	}
	for (const match of html.matchAll(BUNDLE_URL_UNICODE_REGEX)) {
		const url = unescapeBundleUrl(match[0]);
		if (url.includes("licdn.com")) {
			bundles.add(url);
		}
	}
	for (const match of html.matchAll(BUNDLE_RELATIVE_REGEX)) {
		const relative = unescapeBundleUrl(match[1] ?? "");
		if (relative) {
			const normalized = relative.startsWith("/") ? relative : `/${relative}`;
			bundles.add(`https://static.licdn.com${normalized}`);
		}
	}
	for (const match of html.matchAll(SCRIPT_SRC_REGEX)) {
		const raw = unescapeBundleUrl(match[1] ?? "");
		if (!raw) {
			continue;
		}
		if (raw.startsWith("//")) {
			bundles.add(`https:${raw}`);
			continue;
		}
		if (raw.startsWith("/aero-v1/") || raw.startsWith("/assets/")) {
			bundles.add(`https://static.licdn.com${raw}`);
			continue;
		}
		if (raw.startsWith("https://")) {
			bundles.add(raw);
		}
	}
	for (const match of html.matchAll(LINK_HREF_REGEX)) {
		const raw = unescapeBundleUrl(match[1] ?? "");
		if (!raw) {
			continue;
		}
		if (raw.startsWith("//")) {
			bundles.add(`https:${raw}`);
			continue;
		}
		if (raw.startsWith("/aero-v1/") || raw.startsWith("/assets/")) {
			bundles.add(`https://static.licdn.com${raw}`);
			continue;
		}
		if (raw.startsWith("https://") && raw.includes("licdn.com")) {
			bundles.add(raw);
		}
	}
	for (const match of html.matchAll(JSON_SCRIPT_REGEX)) {
		const payload = match[1] ?? "";
		if (!payload) {
			continue;
		}
		for (const urlMatch of payload.matchAll(BUNDLE_URL_ESCAPED_REGEX)) {
			const url = unescapeBundleUrl(urlMatch[0]);
			if (url.includes("licdn.com")) {
				bundles.add(url);
			}
		}
		for (const urlMatch of payload.matchAll(BUNDLE_URL_UNICODE_REGEX)) {
			const url = unescapeBundleUrl(urlMatch[0]);
			if (url.includes("licdn.com")) {
				bundles.add(url);
			}
		}
		for (const urlMatch of payload.matchAll(BUNDLE_URL_REGEX)) {
			bundles.add(urlMatch[0]);
		}
	}

	const jsUrlsIndex = html.indexOf("jsUrls");
	if (jsUrlsIndex !== -1) {
		const window = html.slice(jsUrlsIndex, jsUrlsIndex + 8000);
		for (const match of window.matchAll(BUNDLE_URL_ESCAPED_REGEX)) {
			const url = unescapeBundleUrl(match[0]);
			if (url.includes("licdn.com")) {
				bundles.add(url);
			}
		}
		for (const match of window.matchAll(BUNDLE_URL_UNICODE_REGEX)) {
			const url = unescapeBundleUrl(match[0]);
			if (url.includes("licdn.com")) {
				bundles.add(url);
			}
		}
		for (const match of window.matchAll(BUNDLE_URL_REGEX)) {
			bundles.add(match[0]);
		}
		const arrayStart = window.indexOf("[");
		const arrayEnd = window.indexOf("]");
		if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
			const rawArray = window.slice(arrayStart, arrayEnd + 1);
			const normalized = unescapeBundleUrl(rawArray);
			try {
				const parsed = JSON.parse(normalized) as string[];
				for (const entry of parsed) {
					if (typeof entry === "string") {
						if (entry.startsWith("//")) {
							bundles.add(`https:${entry}`);
						} else if (entry.startsWith("/")) {
							bundles.add(`https://static.licdn.com${entry}`);
						} else if (entry.startsWith("https://")) {
							bundles.add(entry);
						}
					}
				}
			} catch {
				// Ignore parse errors.
			}
		}
		if (DEBUG_QUERY_IDS) {
			debugQueryIds(`entrypoint jsUrls window found bundles=${bundles.size}`);
		}
	}
	return Array.from(bundles);
}

function buildDirectQueryRegex(operation: string): RegExp {
	return new RegExp(`${operation}\\.[a-zA-Z0-9._-]+`, "g");
}

function buildQueryIdMapRegex(operation: string): RegExp {
	return new RegExp(`"${operation}"\\s*:\\s*"([a-zA-Z0-9._-]+)"`, "i");
}

function buildHtmlQueryIdRegex(operation: string): RegExp {
	return new RegExp(`queryId\\s*[:=]\\s*["'](${operation}\\.[a-zA-Z0-9._-]+)["']`, "i");
}

function buildHtmlQueryIdUrlRegex(operation: string): RegExp {
	return new RegExp(`queryId=${operation}\\.[a-zA-Z0-9._-]+`, "i");
}

function buildHtmlQueryIdEncodedRegex(operation: string): RegExp {
	return new RegExp(`${operation}%2E([a-zA-Z0-9._-]+)`, "i");
}

const QUERY_ID_VALUE_REGEXES = [
	/queryId=([a-zA-Z0-9._-]+)/gi,
	/queryId%3D([a-zA-Z0-9._-]+)/gi,
	/queryId\\u003d([a-zA-Z0-9._-]+)/gi,
	/"queryId"\s*:\s*"([a-zA-Z0-9._-]+)"/gi,
];

function extractQueryIdFromText(
	text: string,
	operations: string[],
): { operation: string; queryId: string } | null {
	for (const regex of QUERY_ID_VALUE_REGEXES) {
		for (const match of text.matchAll(regex)) {
			const candidate = match[1] ?? "";
			if (!candidate) {
				continue;
			}
			const operation = candidate.split(".")[0] ?? "";
			if (operations.includes(operation)) {
				return { operation, queryId: candidate };
			}
		}
	}
	return null;
}

async function fetchWebText(
	client: LinkedInClient,
	url: string,
	accept: string,
): Promise<{ status: number; contentType: string; text: string }> {
	const headers = buildWebHeaders(client.getCredentials());
	const response = await fetch(url, {
		method: "GET",
		headers: {
			...headers,
			Accept: accept,
		},
		redirect: "follow",
	});
	const contentType = response.headers.get("content-type") ?? "unknown";
	const text = await response.text();
	return { status: response.status, contentType, text };
}

async function discoverBundles(
	client: LinkedInClient,
	operations: string[],
): Promise<{ bundles: string[]; directQueryId?: { operation: string; queryId: string } }> {
	const bundles = new Set<string>();
	for (const url of LINKEDIN_ENTRYPOINTS) {
		try {
			const response = await fetchWebText(
				client,
				url,
				"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
			);
			debugQueryIds(`entrypoint status=${response.status} url=${url}`);
			if (response.status < 200 || response.status >= 300) {
				continue;
			}
			debugQueryIds(
				`entrypoint contentType=${response.contentType} bytes=${response.text.length} url=${url}`,
			);
			const html = response.text;
			const genericFromHtml = extractQueryIdFromText(html, operations);
			if (genericFromHtml) {
				debugQueryIds(`entrypoint direct_query_id=${genericFromHtml.queryId} url=${url}`);
				return { bundles: [], directQueryId: genericFromHtml };
			}
			for (const operation of operations) {
				const htmlDirect =
					buildHtmlQueryIdRegex(operation).exec(html) ??
					buildHtmlQueryIdUrlRegex(operation).exec(html) ??
					null;
				if (htmlDirect?.[1]) {
					debugQueryIds(`entrypoint direct_query_id=${htmlDirect[1]} url=${url}`);
					return {
						bundles: [],
						directQueryId: { operation, queryId: htmlDirect[1] },
					};
				}
				if (htmlDirect?.[0]?.includes(`queryId=${operation}.`)) {
					const extracted = htmlDirect[0].split("queryId=")[1];
					if (extracted) {
						debugQueryIds(`entrypoint direct_query_id=${extracted} url=${url}`);
						return {
							bundles: [],
							directQueryId: { operation, queryId: extracted },
						};
					}
				}
				const encodedMatch = buildHtmlQueryIdEncodedRegex(operation).exec(html);
				if (encodedMatch?.[1]) {
					const decoded = `${operation}.${encodedMatch[1]}`;
					debugQueryIds(`entrypoint direct_query_id=${decoded} url=${url}`);
					return {
						bundles: [],
						directQueryId: { operation, queryId: decoded },
					};
				}
				const directQueryMatch = html.match(buildDirectQueryRegex(operation));
				if (directQueryMatch && directQueryMatch.length > 0) {
					debugQueryIds(`entrypoint direct_query_id=${directQueryMatch[0]} url=${url}`);
					return {
						bundles: [],
						directQueryId: { operation, queryId: directQueryMatch[0] },
					};
				}
			}
			const extracted = extractBundleUrlsFromHtml(response.text);
			for (const bundleUrl of extracted) {
				bundles.add(bundleUrl);
			}
			debugQueryIds(`entrypoint bundles=${bundles.size} url=${url}`);
			if (DEBUG_QUERY_IDS && extracted.length > 0) {
				debugQueryIds(`entrypoint sample=${extracted.slice(0, 3).join(", ")}`);
			}
		} catch {
			debugQueryIds(`entrypoint failed url=${url}`);
			continue;
		}
		if (bundles.size > 0) {
			break;
		}
	}
	return { bundles: Array.from(bundles) };
}

async function fetchBundleText(client: LinkedInClient, url: string): Promise<string> {
	const response = await fetchWebText(client, url, "*/*");
	if (response.status < 200 || response.status >= 300) {
		debugQueryIds(`bundle status=${response.status} url=${url}`);
		throw new Error(`Failed to fetch bundle ${url}`);
	}
	debugQueryIds(`bundle ok url=${url}`);
	return response.text;
}

function extractQueryIdFromBundleText(
	contents: string,
	operations: string[],
): { operation: string; queryId: string } | null {
	const generic = extractQueryIdFromText(contents, operations);
	if (generic) {
		return generic;
	}
	for (const operation of operations) {
		const mapMatch = buildQueryIdMapRegex(operation).exec(contents);
		if (mapMatch?.[1]) {
			return { operation, queryId: `${operation}.${mapMatch[1]}` };
		}
		const direct = contents.match(buildDirectQueryRegex(operation));
		if (direct?.[0]) {
			return { operation, queryId: direct[0] };
		}
	}
	return null;
}

async function fetchQueryIdsFromSettings(
	client: LinkedInClient,
	settingsQueryId: string,
	operations: string[],
): Promise<Record<string, string>> {
	try {
		const credentials = client.getCredentials();
		const response = await client.request(
			`/graphql?includeWebMetadata=true&variables=()&queryId=${settingsQueryId}`,
			{
				method: "GET",
				headers: {
					Accept: "application/graphql",
					"X-Li-Graphql-Token": credentials.csrfToken,
				},
			},
		);
		const text = await response.text();
		const extracted = extractQueryIdFromText(text, operations);
		if (extracted) {
			return { [extracted.operation]: extracted.queryId };
		}
	} catch {
		// Ignore settings fetch failures.
	}
	return {};
}

export const runtimeQueryIds = {
	cachePath: getCachePath(),

	async getSnapshotInfo(): Promise<QueryIdSnapshotInfo | null> {
		const cachePath = getCachePath();
		const snapshot = await readSnapshot(cachePath);
		if (!snapshot) {
			return null;
		}
		const fetchedAt = Date.parse(snapshot.fetchedAt);
		const ageMs = Number.isNaN(fetchedAt) ? Number.POSITIVE_INFINITY : Date.now() - fetchedAt;
		return {
			cachePath,
			snapshot,
			ageMs,
			isFresh: ageMs < 7 * ONE_DAY_MS,
		};
	},

	async getId(operation: string): Promise<string | null> {
		const cachePath = getCachePath();
		const snapshot = await readSnapshot(cachePath);
		return snapshot?.ids?.[operation] ?? null;
	},

	async refreshFromHar(operations: string[], harPath: string): Promise<QueryIdSnapshot> {
		const ids: Record<string, string> = {};
		let headers: Record<string, string> | undefined;
		const variables: Record<string, string> = {};
		for (const operation of operations) {
			const queryId = extractQueryIdFromHar(harPath, operation);
			if (queryId) {
				ids[operation] = queryId;
			}
			if (!headers) {
				const extractedHeaders = extractHeadersFromHar(harPath, operation);
				if (extractedHeaders) {
					headers = extractedHeaders;
				}
			}
			const extractedVariables = extractVariablesFromHar(harPath, operation);
			if (extractedVariables) {
				variables[operation] = extractedVariables;
			}
		}
		const snapshot: QueryIdSnapshot = {
			fetchedAt: new Date().toISOString(),
			ids,
			discovery: { harPath },
			...(headers && { headers }),
			...(Object.keys(variables).length > 0 && { variables }),
		};
		const cachePath = getCachePath();
		await writeSnapshot(cachePath, snapshot);
		return snapshot;
	},

	async refreshFromLinkedIn(
		client: LinkedInClient,
		operations: string[],
	): Promise<QueryIdSnapshot> {
		const discovery = await discoverBundles(client, operations);
		if (discovery.directQueryId) {
			const ids: Record<string, string> = {
				[discovery.directQueryId.operation]: discovery.directQueryId.queryId,
			};
			if (discovery.directQueryId.operation === "voyagerMessagingDashMessagingSettings") {
				const settingsIds = await fetchQueryIdsFromSettings(
					client,
					discovery.directQueryId.queryId,
					operations,
				);
				Object.assign(ids, settingsIds);
			}
			const snapshot: QueryIdSnapshot = {
				fetchedAt: new Date().toISOString(),
				ids,
				discovery: { harPath: "linkedIn-html" },
			};
			const cachePath = getCachePath();
			await writeSnapshot(cachePath, snapshot);
			return snapshot;
		}
		const maxBundlesEnv = Number.parseInt(process.env.LI_QUERY_ID_MAX_BUNDLES ?? "", 10);
		const maxBundles = Number.isFinite(maxBundlesEnv) && maxBundlesEnv > 0 ? maxBundlesEnv : 200;
		const timeoutEnv = Number.parseInt(process.env.LI_QUERY_ID_TIMEOUT_MS ?? "", 10);
		const timeoutMs = Number.isFinite(timeoutEnv) && timeoutEnv > 0 ? timeoutEnv : 20000;
		const deadline = Date.now() + timeoutMs;

		const bundles = discovery.bundles.slice(0, maxBundles);
		if (bundles.length === 0) {
			throw new Error("No LinkedIn bundles discovered for query ID refresh");
		}

		const ids: Record<string, string> = {};
		const remaining = new Set(operations);
		const concurrency = 3;

		for (let i = 0; i < bundles.length && remaining.size > 0; i += concurrency) {
			if (Date.now() > deadline) {
				break;
			}
			const chunk = bundles.slice(i, i + concurrency);
			await Promise.all(
				chunk.map(async (bundleUrl) => {
					if (remaining.size === 0) {
						return;
					}
					if (Date.now() > deadline) {
						return;
					}
					try {
						const js = await fetchBundleText(client, bundleUrl);
						const extractedQueryId = extractQueryIdFromBundleText(js, operations);
						if (!extractedQueryId) {
							if (DEBUG_QUERY_IDS) {
								debugQueryIds(`bundle skip (no messengerConversations) url=${bundleUrl}`);
							}
							return;
						}
						if (DEBUG_QUERY_IDS) {
							debugQueryIds(`bundle contains ${extractedQueryId.operation} url=${bundleUrl}`);
						}
						ids[extractedQueryId.operation] = extractedQueryId.queryId;
						remaining.delete(extractedQueryId.operation);
					} catch {
						// Ignore bundle failures; continue scanning others.
					}
				}),
			);
		}

		if (Object.keys(ids).length === 0) {
			const scanned = Math.min(bundles.length, maxBundles);
			throw new Error(
				`No query IDs discovered from LinkedIn bundles (scanned ${scanned}, timeout ${timeoutMs}ms)`,
			);
		}

		const snapshot: QueryIdSnapshot = {
			fetchedAt: new Date().toISOString(),
			ids,
			discovery: { harPath: "linkedIn-bundles" },
		};
		const cachePath = getCachePath();
		await writeSnapshot(cachePath, snapshot);
		return snapshot;
	},

	extractFromHar(operation: string, harPath: string): string | null {
		return extractQueryIdFromHar(harPath, operation);
	},
};
