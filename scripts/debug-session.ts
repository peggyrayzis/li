#!/usr/bin/env npx tsx
/**
 * Debug script to test LinkedIn session validity.
 * Runs a single /me request and shows the full response details.
 *
 * Usage:
 *   npx tsx scripts/debug-session.ts
 *
 * Or with explicit credentials:
 *   LINKEDIN_LI_AT=xxx LINKEDIN_JSESSIONID=xxx npx tsx scripts/debug-session.ts
 */

import "dotenv/config";
import { resolveCredentials } from "../src/lib/auth.js";
import { buildHeaders } from "../src/lib/headers.js";
import endpoints from "../src/lib/endpoints.json" with { type: "json" };

async function main() {
	console.log("=== LinkedIn Session Debug ===\n");

	// Resolve credentials
	console.log("Resolving credentials...");
	const { credentials, source, warnings } = await resolveCredentials({
		cookieSource: process.env.LINKEDIN_LI_AT ? undefined : ["chrome", "safari"],
	});

	console.log(`Source: ${source}`);
	if (warnings.length > 0) {
		console.log(`Warnings: ${warnings.join(", ")}`);
	}
	console.log(`li_at: ${credentials.liAt.slice(0, 20)}...`);
	console.log(`JSESSIONID: ${credentials.jsessionId.slice(0, 20)}...`);
	console.log();

	// Build headers
	const headers = buildHeaders(credentials);
	console.log("Request headers:");
	for (const [key, value] of Object.entries(headers)) {
		if (key === "Cookie") {
			// Truncate cookie for readability
			console.log(`  ${key}: ${value.slice(0, 60)}...`);
		} else {
			console.log(`  ${key}: ${value}`);
		}
	}
	console.log();

	// Make request
	const url = `${endpoints.baseUrl}${endpoints.endpoints.me}`;
	console.log(`Fetching: ${url}`);
	console.log();

	const response = await fetch(url, {
		method: "GET",
		headers,
		redirect: "manual",
	});

	console.log("=== Response ===");
	console.log(`Status: ${response.status} ${response.statusText}`);
	console.log();

	console.log("Response headers:");
	response.headers.forEach((value, key) => {
		// Truncate long values
		const displayValue = value.length > 100 ? `${value.slice(0, 100)}...` : value;
		console.log(`  ${key}: ${displayValue}`);
	});
	console.log();

	// Check for session invalidation
	if (response.status === 302) {
		const location = response.headers.get("location");
		const setCookie = response.headers.get("set-cookie") || "";

		console.log("=== REDIRECT DETECTED ===");
		console.log(`Location: ${location}`);
		console.log(`Set-Cookie includes li_at=delete: ${setCookie.includes("li_at=delete")}`);

		if (setCookie.includes("li_at=delete")) {
			console.log("\n❌ SESSION INVALIDATED - LinkedIn deleted the li_at cookie");
			console.log("This means LinkedIn detected the request as automated and invalidated your session.");
		}
	} else if (response.ok) {
		const body = await response.json();
		console.log("=== SUCCESS ===");
		console.log("Response body (first 500 chars):");
		console.log(JSON.stringify(body, null, 2).slice(0, 500));
	} else {
		console.log("=== ERROR ===");
		try {
			const body = await response.text();
			console.log("Response body:");
			console.log(body.slice(0, 1000));
		} catch {
			console.log("Could not read response body");
		}
	}
}

main().catch(console.error);
