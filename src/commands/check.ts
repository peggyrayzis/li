/**
 * Check command - validates session and shows credential sources.
 * Calls validateSession() to verify the LinkedIn session is still active.
 */

import pc from "picocolors";
import type { LinkedInCredentials } from "../lib/auth.js";
import { LinkedInClient } from "../lib/client.js";
import { formatJson } from "../output/json.js";

export interface CheckOptions {
	json?: boolean;
}

export interface CheckResult {
	valid: boolean;
	source: string;
}

/**
 * Format check result for human-readable output.
 */
function formatCheckHuman(result: CheckResult): string {
	const lines: string[] = [];

	if (result.valid) {
		lines.push(`\u{2705} Session ${pc.green("valid")}`);
	} else {
		lines.push(`\u{274C} Session ${pc.red("invalid")}`);
	}

	lines.push(`   Credential source: ${pc.cyan(result.source)}`);

	if (!result.valid) {
		lines.push("");
		lines.push(pc.dim("   Tip: Log into linkedin.com to refresh your session."));
	}

	return lines.join("\n");
}

/**
 * Execute the check command.
 *
 * @param credentials - LinkedIn credentials for authentication
 * @param options - Command options (json flag)
 * @returns Formatted output string
 */
export async function check(
	credentials: LinkedInCredentials,
	options: CheckOptions = {},
): Promise<string> {
	const client = new LinkedInClient(credentials);

	// Validate the session
	const valid = await client.validateSession();

	const result: CheckResult = {
		valid,
		source: credentials.source,
	};

	// Return JSON or human-readable output
	if (options.json) {
		return formatJson(result);
	}

	return formatCheckHuman(result);
}
