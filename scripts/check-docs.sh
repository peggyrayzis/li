#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

CORE_DOCS=(
	"AGENTS.md"
	"docs/SPEC.md"
	"docs/DECISIONS.md"
	"docs/MEMORY.md"
)
MANAGED_DOCS=("${CORE_DOCS[@]}")
TASK_TEMPLATE=".github/ISSUE_TEMPLATE/task.yml"
BUG_TEMPLATE=".github/ISSUE_TEMPLATE/bug.yml"
PR_TEMPLATE=".github/pull_request_template.md"

DOC_FRESHNESS_DAYS="${DOC_FRESHNESS_DAYS:-45}"
DOC_CHECK_ALL_DOCS="${DOC_CHECK_ALL_DOCS:-0}"

errors=0

log() {
	echo "$*"
}

record_error() {
	echo "ERROR: $*" >&2
	errors=$((errors + 1))
}

contains_managed_doc() {
	local candidate="$1"
	for doc in "${MANAGED_DOCS[@]}"; do
		if [[ "$doc" == "$candidate" ]]; then
			return 0
		fi
	done
	return 1
}

validate_last_updated() {
	local file="$1"
	local freshness_cutoff="$2"

	local line
	line="$(grep -E '^Last Updated: [0-9]{4}-[0-9]{2}-[0-9]{2}$' "$file" | head -n 1 || true)"
	if [[ -z "$line" ]]; then
		record_error "$file is missing 'Last Updated: YYYY-MM-DD'"
		return
	fi

	local value="${line#Last Updated: }"
	local days_since
	if days_since="$(node -e '
const dateText = process.argv[1];
const date = new Date(`${dateText}T00:00:00Z`);
if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateText) process.exit(2);
const now = new Date();
const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
if (date > today) process.exit(3);
const days = Math.floor((today.getTime() - date.getTime()) / 86400000);
process.stdout.write(String(days));
' "$value")"; then
		:
	else
		local exit_code=$?
		if [[ "$exit_code" -eq 2 ]]; then
			record_error "$file has invalid Last Updated date: $value"
		else
			record_error "$file has future Last Updated date: $value"
		fi
		return
	fi

	if [[ "$freshness_cutoff" == "1" ]] && (( days_since > DOC_FRESHNESS_DAYS )); then
		record_error "$file is stale (${days_since}d old, limit ${DOC_FRESHNESS_DAYS}d)"
	fi
}

collect_changed_managed_docs() {
	if [[ "$DOC_CHECK_ALL_DOCS" == "1" ]]; then
		printf '%s\n' "${MANAGED_DOCS[@]}"
		return
	fi

	local diff_output=""
	if [[ -n "${GITHUB_BASE_REF:-}" ]]; then
		if ! git rev-parse --verify --quiet "origin/${GITHUB_BASE_REF}" >/dev/null; then
			git fetch --no-tags --depth=1 origin "${GITHUB_BASE_REF}" >/dev/null 2>&1 || true
		fi
		diff_output="$(git diff --name-only "origin/${GITHUB_BASE_REF}...HEAD" 2>/dev/null || true)"
	elif git rev-parse --verify --quiet HEAD >/dev/null; then
		diff_output="$(git diff --name-only HEAD)"
		diff_output="$(printf '%s\n%s\n' "$diff_output" "$(git ls-files --others --exclude-standard)")"
	else
		diff_output="$(git diff --cached --name-only)"
		diff_output="$(printf '%s\n%s\n' "$diff_output" "$(git ls-files --others --exclude-standard)")"
	fi

	while IFS= read -r file; do
		[[ -z "$file" ]] && continue
		if contains_managed_doc "$file"; then
			echo "$file"
		fi
	done <<<"$diff_output"
}

validate_markdown_links() {
	if ! node - "$ROOT_DIR" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const cp = require("node:child_process");

const rootDir = process.argv[2];
const output = cp.execSync('git ls-files "*.md"', { cwd: rootDir, encoding: "utf8" });
const files = output
	.split("\n")
	.map((line) => line.trim())
	.filter(Boolean);

let failures = 0;
const regex = /\[[^\]]+\]\(([^)]+)\)/g;

for (const relativePath of files) {
	const absolutePath = path.join(rootDir, relativePath);
	const content = fs.readFileSync(absolutePath, "utf8");

	for (const match of content.matchAll(regex)) {
		let rawTarget = match[1].trim();
		if (rawTarget.startsWith("<") && rawTarget.endsWith(">")) {
			rawTarget = rawTarget.slice(1, -1).trim();
		}
		const titleIndex = rawTarget.search(/\s+"[^"]*"$/);
		if (titleIndex !== -1) {
			rawTarget = rawTarget.slice(0, titleIndex).trim();
		}
		rawTarget = rawTarget.replace(/^['"]|['"]$/g, "");
		if (!rawTarget) {
			continue;
		}
		if (/^(https?:|mailto:|tel:)/i.test(rawTarget)) {
			continue;
		}
		if (rawTarget.startsWith("#")) {
			continue;
		}

		const hashIndex = rawTarget.indexOf("#");
		const targetPath = hashIndex === -1 ? rawTarget : rawTarget.slice(0, hashIndex);
		if (!targetPath) {
			continue;
		}

		const resolved = targetPath.startsWith("/")
			? path.join(rootDir, targetPath.slice(1))
			: path.resolve(path.dirname(absolutePath), targetPath);

		if (!fs.existsSync(resolved)) {
			console.error(`Broken markdown link in ${relativePath}: ${rawTarget}`);
			failures += 1;
		}
	}
}

if (failures > 0) {
	process.exit(1);
}
NODE
	then
		record_error "Markdown link validation failed"
	fi
}

require_file() {
	local file="$1"
	if [[ ! -f "$file" ]]; then
		record_error "Missing required file: $file"
	fi
}

for file in "${CORE_DOCS[@]}" "$TASK_TEMPLATE" "$BUG_TEMPLATE" "$PR_TEMPLATE"; do
	require_file "$file"
done

for file in "${MANAGED_DOCS[@]}"; do
	if [[ -f "$file" ]]; then
		validate_last_updated "$file" "0"
	fi
done

freshness_docs=()
while IFS= read -r doc; do
	[[ -z "$doc" ]] && continue
	freshness_docs+=("$doc")
done < <(collect_changed_managed_docs | sort -u)
if [[ "${#freshness_docs[@]}" -gt 0 ]]; then
	for file in "${freshness_docs[@]}"; do
		if [[ -f "$file" ]]; then
			validate_last_updated "$file" "1"
		fi
	done
else
	log "No managed docs changed; freshness check skipped."
fi

if [[ -f "$TASK_TEMPLATE" ]]; then
	for section in \
		"Summary" \
		"Scope" \
		"Acceptance Criteria" \
		"Role Plan" \
		"Active Role" \
		"Watch Plan" \
		"Signatures" \
		"Artifact" \
		"Review Report"; do
		escaped_section="$(printf '%s' "$section" | sed 's/[][(){}.+*?^$|\/\\]/\\&/g')"
		if ! grep -Eq "label:[[:space:]]*\"?${escaped_section}\"?[[:space:]]*$" "$TASK_TEMPLATE"; then
			record_error "$TASK_TEMPLATE missing required section label: $section"
		fi
	done
fi

if [[ -f "$BUG_TEMPLATE" ]]; then
	for section in "Problem" "Reproduction" "Expected vs Actual" "Artifact"; do
		escaped_section="$(printf '%s' "$section" | sed 's/[][(){}.+*?^$|\/\\]/\\&/g')"
		if ! grep -Eq "label:[[:space:]]*\"?${escaped_section}\"?[[:space:]]*$" "$BUG_TEMPLATE"; then
			record_error "$BUG_TEMPLATE missing required section label: $section"
		fi
	done
fi

if [[ -f "$PR_TEMPLATE" ]]; then
	for heading in "Closes #" "Description" "Summary" "Checks" "Review"; do
		escaped_heading="$(printf '%s' "$heading" | sed 's/[][(){}.+*?^$|\/\\]/\\&/g')"
		if ! grep -Eq "^##[[:space:]]+${escaped_heading}[[:space:]]*$" "$PR_TEMPLATE"; then
			record_error "$PR_TEMPLATE missing required heading: $heading"
		fi
	done
fi

validate_markdown_links

if [[ "$errors" -gt 0 ]]; then
	echo "check-docs failed with ${errors} issue(s)." >&2
	exit 1
fi

echo "check-docs passed"
