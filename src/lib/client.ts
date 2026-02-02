/**
 * LinkedIn Voyager API client.
 * Handles HTTP requests with authentication, rate limiting, and retry logic.
 */

import type { LinkedInCredentials } from "./auth.js";
import endpoints from "./endpoints.json" with { type: "json" };
import { buildHeaders } from "./headers.js";

const DEBUG_HTTP =
	process.env.LI_DEBUG_HTTP === "1" || process.env.LI_DEBUG_HTTP === "true";

function debugHttp(message: string): void {
	if (!DEBUG_HTTP) {
		return;
	}
	process.stderr.write(`[li][http] ${message}\n`);
}

/**
 * Custom error class for LinkedIn API errors.
 * Includes HTTP status and actionable error message.
 */
export class LinkedInApiError extends Error {
	constructor(
		public readonly status: number,
		message: string,
	) {
		super(message);
		this.name = "LinkedInApiError";
	}
}

/**
 * Minimum delay between API requests in milliseconds.
 * LinkedIn is aggressive about bot detection.
 */
/**
 * Minimum delay between API requests in milliseconds.
 * Using random delays (2-5 seconds) like open-linkedin-api to evade detection.
 */
function getRequestDelay(): number {
	return Math.floor(Math.random() * 3000) + 2000; // 2000-5000ms
}

/**
 * Initial backoff delay for 429 responses.
 */
const INITIAL_BACKOFF_MS = 5000;

/**
 * Maximum number of retries for 429 responses.
 */
const MAX_RETRIES = 5;

/**
 * Maps HTTP status codes to actionable error messages.
 */
function getErrorMessage(status: number, details?: string): string {
	switch (status) {
		case 401:
			return "Session expired. Log into linkedin.com and retry.";
		case 403:
			return "Not authorized for this action. Check your permissions.";
		case 404:
			return `Resource not found${details ? `: ${details}` : ""}.`;
		case 400:
			return `Invalid request${details ? `: ${details}` : ""}.`;
		case 429:
			return "Rate limited. Maximum retries exceeded.";
		case 999:
			return "LinkedIn is blocking requests. Try again later or rotate your session.";
		default:
			return `Request failed with status ${status}${details ? `: ${details}` : ""}.`;
	}
}

/**
 * Sleep for the specified duration.
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RequestOptions {
	method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
	body?: string;
	headers?: Record<string, string>;
}

/**
 * LinkedIn Voyager API client.
 *
 * Handles:
 * - Authentication via cookie headers
 * - Rate limiting (500ms minimum between requests)
 * - 429 retry with exponential backoff
 * - Error mapping to actionable messages
 */
export class LinkedInClient {
	private readonly credentials: LinkedInCredentials;
	private readonly baseUrl: string;
	private readonly headers: Record<string, string>;
	private lastRequestTime = 0;

	constructor(credentials: LinkedInCredentials) {
		this.credentials = credentials;
		this.baseUrl = endpoints.baseUrl;
		// Build headers once per client instance to keep page instance consistent
		this.headers = buildHeaders(this.credentials);
	}

	/**
	 * Validates the current session by calling GET /me.
	 *
	 * @returns true if session is valid, false if expired/invalid
	 */
	async validateSession(): Promise<boolean> {
		const url = `${this.baseUrl}${endpoints.endpoints.me}`;

		try {
			const response = await this.fetchWithRateLimit(url, {
				method: "GET",
				headers: this.headers,
			});

			return response.ok;
		} catch {
			return false;
		}
	}

	/**
	 * Makes an authenticated request to the Voyager API.
	 *
	 * @param path - API path (e.g., "/me", "/identity/profiles/username")
	 * @param options - Request options (method, body, additional headers)
	 * @returns Response object
	 * @throws LinkedInApiError on HTTP errors with actionable messages
	 */
	async request(path: string, options: RequestOptions = {}): Promise<Response> {
		const url = `${this.baseUrl}${path}`;

		const fetchOptions: RequestInit = {
			method: options.method ?? "GET",
			headers: {
				...this.headers,
				...options.headers,
			},
			body: options.body,
		};

		return this.requestWithRetry(url, fetchOptions);
	}

	/**
	 * Makes an authenticated request to a full URL (non-Voyager endpoints).
	 */
	async requestAbsolute(url: string, options: RequestOptions = {}): Promise<Response> {
		const fetchOptions: RequestInit = {
			method: options.method ?? "GET",
			headers: {
				...this.headers,
				...options.headers,
			},
			body: options.body,
		};

		return this.requestWithRetry(url, fetchOptions);
	}

	/**
	 * Enforces rate limiting and makes the request.
	 * Uses manual redirect handling to detect session invalidation.
	 */
	private async fetchWithRateLimit(url: string, options: RequestInit): Promise<Response> {
		// Always add random delay before requests (2-5 seconds) to evade detection
		// This mimics human browsing behavior
		if (this.lastRequestTime > 0) {
			const delayMs = getRequestDelay();
			debugHttp(`delay=${delayMs}ms method=${options.method ?? "GET"} url=${url}`);
			await sleep(delayMs);
		}

		try {
			// Use manual redirect to detect session invalidation
			const response = await fetch(url, { ...options, redirect: "manual" });
			this.lastRequestTime = Date.now();

			const headerBag = response.headers;
			const setCookie = headerBag?.get ? headerBag.get("set-cookie") : null;
			const location = headerBag?.get ? headerBag.get("location") : null;
			const hasLiAtDelete = setCookie?.includes("li_at=delete") ?? false;
			const hasJsessionDelete = setCookie?.includes("JSESSIONID=delete") ?? false;

			debugHttp(
				[
					`status=${response.status}`,
					`method=${options.method ?? "GET"}`,
					`url=${url}`,
					`location=${location ? "yes" : "no"}`,
					`setCookie=${setCookie ? "yes" : "no"}`,
					`liAtDelete=${hasLiAtDelete}`,
					`jsessionDelete=${hasJsessionDelete}`,
				].join(" "),
			);

			// Detect LinkedIn session invalidation (302 to same URL with delete cookie)
			if (response.status === 302) {
				const setCookieText = setCookie || "";

				if (setCookieText.includes("li_at=delete") || location === url) {
					throw new LinkedInApiError(
						401,
						"Session expired or invalidated by LinkedIn. Please log in again and update your credentials.",
					);
				}
			}

			return response;
		} catch (error) {
			this.lastRequestTime = Date.now();
			const err = error instanceof Error ? error : undefined;
			const cause = err && "cause" in err ? (err as { cause?: unknown }).cause : undefined;
			const causeMessage =
				cause instanceof Error ? cause.message : cause ? String(cause) : undefined;
			const causeCode =
				cause && typeof cause === "object" && "code" in cause
					? String((cause as { code?: unknown }).code)
					: undefined;
			debugHttp(
				[
					`error=${error instanceof Error ? error.message : "Unknown error"}`,
					causeMessage ? `cause=${causeMessage}` : null,
					causeCode ? `causeCode=${causeCode}` : null,
					`method=${options.method ?? "GET"}`,
					`url=${url}`,
				]
					.filter(Boolean)
					.join(" "),
			);
			if (error instanceof LinkedInApiError) {
				throw error;
			}
			throw new LinkedInApiError(
				0,
				`Network error: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	/**
	 * Makes request with 429 retry and exponential backoff.
	 */
	private async requestWithRetry(
		url: string,
		options: RequestInit,
		attempt = 0,
	): Promise<Response> {
		const response = await this.fetchWithRateLimit(url, options);

		// Handle 429 with exponential backoff
		if (response.status === 429) {
			if (attempt >= MAX_RETRIES) {
				throw new LinkedInApiError(429, getErrorMessage(429));
			}

			const backoffMs = INITIAL_BACKOFF_MS * 2 ** attempt;
			await sleep(backoffMs);
			return this.requestWithRetry(url, options, attempt + 1);
		}

		// Handle other errors
		if (!response.ok) {
			let details: string | undefined;
			try {
				const body = (await response.json()) as { message?: string; error?: string };
				details = body.message ?? body.error ?? undefined;
			} catch {
				// Ignore JSON parse errors
			}

			throw new LinkedInApiError(response.status, getErrorMessage(response.status, details));
		}

		return response;
	}
}
