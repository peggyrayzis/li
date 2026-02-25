import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT_DIR = fileURLToPath(new URL("../../", import.meta.url));

function read(relativePath: string): string {
	return readFileSync(join(ROOT_DIR, relativePath), "utf8");
}

describe("repository operating system guardrails", () => {
	it("has multi-agent config and role files with expected sandbox modes", () => {
		const config = read(".codex/config.toml");
		expect(config).toContain("multi_agent = true");
		expect(config).toContain("max_threads = 4");
		expect(config).toContain("max_depth = 2");

		const roles = [
			{ file: ".codex/agents/explorer.toml", mode: "read-only" },
			{ file: ".codex/agents/worker.toml", mode: "workspace-write" },
			{ file: ".codex/agents/monitor.toml", mode: "read-only" },
			{ file: ".codex/agents/reviewer.toml", mode: "read-only" },
		];

		for (const role of roles) {
			expect(existsSync(join(ROOT_DIR, role.file))).toBe(true);
			expect(read(role.file)).toContain(`sandbox_mode = "${role.mode}"`);
		}
	});

	it("has executable git hooks with required gate commands", () => {
		const preCommitPath = join(ROOT_DIR, ".githooks/pre-commit");
		const prePushPath = join(ROOT_DIR, ".githooks/pre-push");
		expect(existsSync(preCommitPath)).toBe(true);
		expect(existsSync(prePushPath)).toBe(true);

		expect(statSync(preCommitPath).mode & 0o111).toBeGreaterThan(0);
		expect(statSync(prePushPath).mode & 0o111).toBeGreaterThan(0);

		const preCommit = read(".githooks/pre-commit");
		expect(preCommit).toContain("biome check --write");
		expect(preCommit).toContain("npm run typecheck");

		const prePush = read(".githooks/pre-push");
		expect(prePush).toContain("PROJECT_ALLOW_MAIN_PUSH");
		expect(prePush).toContain("npm run check");
		expect(prePush).toContain("npm run security");
	});

	it("has docs-check workflow with docs, core, and security steps", () => {
		const workflow = read(".github/workflows/docs-check.yml");
		expect(workflow).toContain("jobs:");
		expect(workflow).toContain("docs:");
		expect(workflow).toContain("core:");
		expect(workflow).toContain("security:");
		expect(workflow).toContain("bash scripts/check-docs.sh");
		expect(workflow).toContain("npm run check");
		expect(workflow).toContain("npm run security");
	});

	it("has issue and pull request templates", () => {
		expect(existsSync(join(ROOT_DIR, ".github/ISSUE_TEMPLATE/task.yml"))).toBe(true);
		expect(existsSync(join(ROOT_DIR, ".github/ISSUE_TEMPLATE/bug.yml"))).toBe(true);
		expect(existsSync(join(ROOT_DIR, ".github/pull_request_template.md"))).toBe(true);
	});
});
