#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
	echo "Usage: scripts/open-pr.sh <issue-number> [--draft]" >&2
	exit 1
fi

ISSUE_NUMBER="$1"
DRAFT_FLAG="${2:-}"

if [[ ! "$ISSUE_NUMBER" =~ ^[0-9]+$ ]]; then
	echo "Issue number must be numeric: $ISSUE_NUMBER" >&2
	exit 1
fi

if [[ -n "$DRAFT_FLAG" && "$DRAFT_FLAG" != "--draft" ]]; then
	echo "Unknown option: $DRAFT_FLAG" >&2
	exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
	echo "GitHub CLI (gh) is required to open a PR." >&2
	exit 1
fi

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$CURRENT_BRANCH" != codex/* ]]; then
	echo "Current branch must match codex/*; found $CURRENT_BRANCH" >&2
	exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
	echo "Working tree is not clean. Commit or stash changes before opening a PR." >&2
	exit 1
fi

PR_TITLE="$(git log -1 --pretty=%s)"
BODY_FILE="$(mktemp)"

cat > "$BODY_FILE" <<EOF2
## Closes #
Closes #${ISSUE_NUMBER}

## Description
Describe the problem and the chosen implementation.

## Summary
- 

## Checks
- [ ] npm run check
- [ ] npm run security
- [ ] bash scripts/check-docs.sh

## Review
- [ ] Reviewer findings addressed or documented
- [ ] Residual risks documented
EOF2

GH_ARGS=(pr create --base main --head "$CURRENT_BRANCH" --title "$PR_TITLE" --body-file "$BODY_FILE")
if [[ "$DRAFT_FLAG" == "--draft" ]]; then
	GH_ARGS+=(--draft)
fi

gh "${GH_ARGS[@]}"
rm -f "$BODY_FILE"
