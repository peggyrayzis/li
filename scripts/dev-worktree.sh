#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
	echo "Usage: scripts/dev-worktree.sh <task-id> [base-ref]" >&2
	exit 1
fi

TASK_ID="$1"
BASE_REF="${2:-main}"

SANITIZED_TASK_ID="$(echo "$TASK_ID" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9._-' '-')"
if [[ -z "$SANITIZED_TASK_ID" ]]; then
	echo "Invalid task-id: $TASK_ID" >&2
	exit 1
fi

BRANCH_NAME="codex/${SANITIZED_TASK_ID}"
ROOT_DIR="$(git rev-parse --show-toplevel)"
PROJECT_NAME="$(basename "$ROOT_DIR")"
WORKTREE_PATH="${WORKTREE_PATH:-$(dirname "$ROOT_DIR")/${PROJECT_NAME}-${SANITIZED_TASK_ID}}"

cd "$ROOT_DIR"

if [[ -e "$WORKTREE_PATH" ]]; then
	echo "Worktree path already exists: $WORKTREE_PATH" >&2
	exit 1
fi

START_REF="$BASE_REF"
if ! git rev-parse --verify --quiet "$START_REF" >/dev/null; then
	if ! git rev-parse --verify --quiet "origin/$START_REF" >/dev/null; then
		git fetch origin "$BASE_REF" >/dev/null 2>&1 || true
	fi
	if git rev-parse --verify --quiet "origin/$START_REF" >/dev/null; then
		START_REF="origin/$START_REF"
	else
		echo "Cannot resolve base ref: $BASE_REF" >&2
		exit 1
	fi
fi

if git show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
	git worktree add "$WORKTREE_PATH" "$BRANCH_NAME"
else
	git worktree add -b "$BRANCH_NAME" "$WORKTREE_PATH" "$START_REF"
fi

echo "Created worktree: $WORKTREE_PATH"
echo "Branch: $BRANCH_NAME"
