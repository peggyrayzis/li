#!/bin/bash
# Post-edit hook: runs typecheck, tests, and lint after editing TypeScript files
# Receives JSON via stdin with tool_result containing the file path

cd "$(dirname "$0")/../.." 2>/dev/null || exit 0

# Read stdin (tool result JSON)
INPUT=$(cat)

# Extract file path - try multiple JSON paths, fall back gracefully if jq missing
if command -v jq &>/dev/null; then
  FILE_PATH=$(echo "$INPUT" | jq -r '
    .tool_result.path //
    .tool_result.file_path //
    .tool_input.file_path //
    empty
  ' 2>/dev/null)
else
  FILE_PATH=$(echo "$INPUT" | grep -oE '"file_path":\s*"[^"]+"' | head -1 | sed 's/.*"file_path":\s*"//' | sed 's/"$//')
fi

# Exit if no file path or not a TS file in src/ or tests/
[[ -z "$FILE_PATH" ]] && exit 0
[[ "$FILE_PATH" != *.ts ]] && exit 0
[[ "$FILE_PATH" != *"/src/"* && "$FILE_PATH" != *"/tests/"* ]] && exit 0

# Run typecheck
echo "→ Typecheck"
pnpm typecheck 2>&1 | head -20 || true

# Run lint check
echo "→ Lint"
pnpm lint 2>&1 | head -10 || true

# Run related tests (extract base name without .test suffix)
BASENAME=$(basename "$FILE_PATH" .ts | sed 's/\.test$//')
if [[ -n "$BASENAME" ]]; then
  echo "→ Tests: $BASENAME"
  pnpm test:run -- "$BASENAME" --reporter=dot 2>&1 | tail -10 || true
fi
