/**
 * Build LinkedIn X-Li-Track metadata with local timezone values.
 *
 * Hardcoding timezone values (e.g. America/New_York) can make requests look
 * inconsistent with the user's actual session fingerprint.
 */
export function buildLiTrackHeader(): string {
	const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
	const timezoneOffset = Number((-new Date().getTimezoneOffset() / 60).toFixed(2));

	return JSON.stringify({
		clientVersion: "0.2.3802",
		mpVersion: "0.2.3802",
		osName: "web",
		timezoneOffset,
		timezone,
		deviceFormFactor: "DESKTOP",
		mpName: "web",
	});
}
