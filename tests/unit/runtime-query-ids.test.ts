import { existsSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runtimeQueryIds } from "../../src/lib/runtime-query-ids.js";

const fixtureHarPath = path.join(process.cwd(), "tests", "fixtures", "messaging.har.json");

function tempCachePath(): string {
	return path.join(os.tmpdir(), `li-query-ids-${Date.now()}-${Math.random()}.json`);
}

afterEach(() => {
	if (process.env.LINKEDIN_QUERY_ID_CACHE_PATH) {
		const cachePath = process.env.LINKEDIN_QUERY_ID_CACHE_PATH;
		if (existsSync(cachePath)) {
			rmSync(cachePath);
		}
		delete process.env.LINKEDIN_QUERY_ID_CACHE_PATH;
	}
});

describe("runtimeQueryIds", () => {
	it("returns null when no cache exists", async () => {
		process.env.LINKEDIN_QUERY_ID_CACHE_PATH = tempCachePath();

		const info = await runtimeQueryIds.getSnapshotInfo();
		expect(info).toBeNull();
	});

	it("refreshes cache from HAR and reads ids", async () => {
		process.env.LINKEDIN_QUERY_ID_CACHE_PATH = tempCachePath();

		const snapshot = await runtimeQueryIds.refreshFromHar(
			["messengerConversations"],
			fixtureHarPath,
		);

		expect(snapshot.ids.messengerConversations).toBe("messengerConversations.test123");

		const info = await runtimeQueryIds.getSnapshotInfo();
		expect(info).not.toBeNull();
		expect(info?.snapshot.ids.messengerConversations).toBe("messengerConversations.test123");
	});
});
