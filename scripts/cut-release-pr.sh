#!/usr/bin/env bash
set -euo pipefail

usage() {
	echo "Usage: scripts/cut-release-pr.sh [--dry-run]" >&2
}

DRY_RUN="false"
if [[ "${1:-}" == "--dry-run" ]]; then
	DRY_RUN="true"
	shift
fi

if [[ $# -ne 0 ]]; then
	usage
	exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
	echo "GitHub CLI (gh) is required." >&2
	exit 1
fi
if ! command -v pnpm >/dev/null 2>&1; then
	echo "pnpm is required." >&2
	exit 1
fi

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

if ! git diff --quiet || ! git diff --cached --quiet; then
	echo "Working tree is not clean. Commit or stash changes first." >&2
	exit 1
fi

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$CURRENT_BRANCH" != "main" ]]; then
	echo "Switching to main from $CURRENT_BRANCH"
	git checkout main
fi

echo "Syncing main..."
git fetch origin --prune
git pull --ff-only origin main

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
RELEASE_BRANCH="codex/release-${TIMESTAMP}"
echo "Creating release branch: $RELEASE_BRANCH"
git checkout -b "$RELEASE_BRANCH"

OLD_VERSION="$(node -p "require('./package.json').version")"
echo "Running changeset versioning..."
pnpm version-packages
pnpm install --lockfile-only
NEW_VERSION="$(node -p "require('./package.json').version")"

if git diff --quiet; then
	echo "No release changes generated (no pending changesets)."
	git checkout main
	git branch -D "$RELEASE_BRANCH"
	exit 0
fi

echo "Version: $OLD_VERSION -> $NEW_VERSION"
git add -A
git commit -m "chore: release"

if [[ "$DRY_RUN" == "true" ]]; then
	echo "Dry run complete. Skipping push/PR creation."
	echo "Release commit created on $RELEASE_BRANCH."
	exit 0
fi

git push -u origin "$RELEASE_BRANCH"

BODY_FILE="$(mktemp)"
cat > "$BODY_FILE" <<EOF2
## Description
Cut release v${NEW_VERSION}.

## Summary
- bump package version to \`${NEW_VERSION}\`
- update \`CHANGELOG.md\`
- consume pending changesets

## Checks
- [x] npm run check
- [x] npm run security
EOF2

PR_URL="$(gh pr create --base main --head "$RELEASE_BRANCH" --title "chore: release" --body-file "$BODY_FILE")"
rm -f "$BODY_FILE"

echo "Release PR created: $PR_URL"
echo "After merge, run the Release workflow manually to publish/tag."
