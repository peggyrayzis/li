/**
 * LinkedIn Voyager API client.
 * Handles HTTP requests with authentication, rate limiting, and retry logic.
 */

import type { LinkedInCredentials } from "./auth.js";
import endpoints from "./endpoints.json" with { type: "json" };
import { buildHeaders } from "./headers.js";

const DEBUG_HTTP = process.env.LI_DEBUG_HTTP === "1" || process.env.LI_DEBUG_HTTP === "true";

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
 * Defaults to a short randomized delay (500-1200ms) and supports env overrides.
 */
function parseDelayEnv(value: string | undefined): number | null {
	if (!value) {
		return null;
	}
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) {
		return null;
	}
	return parsed;
}

function normalizeDelay(value: number | undefined): number | null {
	if (value === undefined) {
		return null;
	}
	if (!Number.isFinite(value) || value < 0) {
		return null;
	}
	return Math.round(value);
}

/**
 * Initial backoff delay for 429 responses.
 */
const INITIAL_BACKOFF_MS = 5000;

/**
 * Maximum number of retries for 429 responses.
 */
const MAX_RETRIES = 5;

const ADAPTIVE_INCREASE_FACTOR = 1.5;
const ADAPTIVE_BLOCK_FACTOR = 2;
const ADAPTIVE_DECAY_FACTOR = 0.9;
const ADAPTIVE_MIN_CAP_MS = 5000;
const ADAPTIVE_MAX_CAP_MS = 8000;

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

export interface LinkedInClientOptions {
	delayMinMs?: number;
	delayMaxMs?: number;
	adaptivePacing?: boolean;
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
	private delayMinMs: number;
	private delayMaxMs: number;
	private readonly delayMinBaseline: number;
	private readonly delayMaxBaseline: number;
	private readonly adaptivePacing: boolean;

	constructor(credentials: LinkedInCredentials, options: LinkedInClientOptions = {}) {
		this.credentials = credentials;
		this.baseUrl = endpoints.baseUrl;
		// Build headers once per client instance to keep page instance consistent
		this.headers = buildHeaders(this.credentials);

		const minOverride = normalizeDelay(options.delayMinMs);
		const maxOverride = normalizeDelay(options.delayMaxMs);
		const minEnv = parseDelayEnv(process.env.LI_REQUEST_DELAY_MIN_MS);
		const maxEnv = parseDelayEnv(process.env.LI_REQUEST_DELAY_MAX_MS);
		const min = minOverride ?? minEnv ?? 500;
		const max = maxOverride ?? maxEnv ?? 1200;
		const safeMax = max >= min ? max : min;
		this.delayMinMs = min;
		this.delayMaxMs = safeMax;
		this.delayMinBaseline = min;
		this.delayMaxBaseline = safeMax;
		this.adaptivePacing = options.adaptivePacing ?? false;
	}

	getCredentials(): LinkedInCredentials {
		return this.credentials;
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
		// Always add random delay before requests to evade detection.
		// Uses configurable min/max delays to mimic human browsing behavior.
		if (this.lastRequestTime > 0) {
			const delayMs = this.getRequestDelay();
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
			this.recordRateLimit();
			if (attempt >= MAX_RETRIES) {
				throw new LinkedInApiError(429, getErrorMessage(429));
			}

			const backoffMs = INITIAL_BACKOFF_MS * 2 ** attempt;
			await sleep(backoffMs);
			return this.requestWithRetry(url, options, attempt + 1);
		}

		// Handle other errors
		if (!response.ok) {
			if (response.status === 999) {
				this.recordBlock();
			}
			let details: string | undefined;
			try {
				const body = (await response.json()) as { message?: string; error?: string };
				details = body.message ?? body.error ?? undefined;
			} catch {
				try {
					const text = await response.text();
					if (text) {
						details = text.slice(0, 500);
					}
				} catch {
					// Ignore body parse errors
				}
			}

			throw new LinkedInApiError(response.status, getErrorMessage(response.status, details));
		}

		this.recordSuccess();
		return response;
	}

	private getRequestDelay(): number {
		const range = this.delayMaxMs - this.delayMinMs;
		return this.delayMinMs + Math.floor(Math.random() * (range + 1));
	}

	private recordRateLimit(): void {
		this.increaseDelay(ADAPTIVE_INCREASE_FACTOR);
	}

	private recordBlock(): void {
		this.increaseDelay(ADAPTIVE_BLOCK_FACTOR);
	}

	private recordSuccess(): void {
		if (!this.adaptivePacing) {
			return;
		}
		if (this.delayMinMs <= this.delayMinBaseline && this.delayMaxMs <= this.delayMaxBaseline) {
			return;
		}
		this.delayMinMs = Math.max(
			this.delayMinBaseline,
			Math.round(this.delayMinMs * ADAPTIVE_DECAY_FACTOR),
		);
		this.delayMaxMs = Math.max(
			this.delayMaxBaseline,
			Math.round(this.delayMaxMs * ADAPTIVE_DECAY_FACTOR),
		);
		if (this.delayMaxMs < this.delayMinMs) {
			this.delayMaxMs = this.delayMinMs;
		}
	}

	private increaseDelay(factor: number): void {
		if (!this.adaptivePacing) {
			return;
		}
		const nextMin = Math.min(ADAPTIVE_MIN_CAP_MS, Math.round(this.delayMinMs * factor));
		const nextMax = Math.min(ADAPTIVE_MAX_CAP_MS, Math.round(this.delayMaxMs * factor));
		this.delayMinMs = Math.max(this.delayMinBaseline, nextMin);
		this.delayMaxMs = Math.max(this.delayMaxBaseline, nextMax);
		if (this.delayMaxMs < this.delayMinMs) {
			this.delayMaxMs = this.delayMinMs;
		}
	}
}
