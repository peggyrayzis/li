/**
 * JSON output formatting for the LinkedIn CLI.
 * Used when --json flag is passed.
 */

/**
 * Format any data as JSON with 2-space indentation.
 * @param data - Any data to serialize
 * @returns JSON string with 2-space indent
 */
export function formatJson(data: unknown): string {
	if (data === undefined) {
		return "{}";
	}
	return JSON.stringify(data, null, 2);
}
