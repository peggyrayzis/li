#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

if [[ ! -d ".githooks" ]]; then
	echo "Missing .githooks directory" >&2
	exit 1
fi

chmod +x .githooks/pre-commit .githooks/pre-push

git config core.hooksPath .githooks

echo "Git hooks installed from .githooks/"
