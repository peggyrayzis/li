#!/bin/bash
# Verification script: run after subagent completion to verify changes were persisted
# Usage: .claude/hooks/verify-changes.sh [expected_new_tests]
# Example: .claude/hooks/verify-changes.sh 5

set -e
cd "$(dirname "$0")/../.."

EXPECTED_NEW_TESTS=${1:-0}

echo "🔍 Verifying changes..."

# Show git status
echo ""
echo "📁 Modified files:"
git status --short | head -20

# Count modified lines
MODIFIED=$(git diff --stat | tail -1)
if [ -n "$MODIFIED" ]; then
  echo ""
  echo "📊 Changes: $MODIFIED"
else
  echo ""
  echo "⚠️  No changes detected in git diff!"
  echo "   If a subagent reported success but no changes appear,"
  echo "   the changes may not have persisted due to sandbox restrictions."
fi

# Run tests and extract count
echo ""
echo "🧪 Running tests..."
TEST_OUTPUT=$(pnpm test:run 2>&1)
TEST_COUNT=$(echo "$TEST_OUTPUT" | grep -oE '[0-9]+ passed' | head -1 | grep -oE '[0-9]+')

echo "   Tests passing: $TEST_COUNT"

# Check if we have a baseline
BASELINE_FILE=".claude/test-baseline.txt"
if [ -f "$BASELINE_FILE" ]; then
  BASELINE=$(cat "$BASELINE_FILE")
  DIFF=$((TEST_COUNT - BASELINE))

  if [ $DIFF -gt 0 ]; then
    echo "   ✅ +$DIFF new tests since baseline"
  elif [ $DIFF -lt 0 ]; then
    echo "   ❌ $DIFF tests (fewer than baseline!)"
  else
    echo "   ⚠️  No new tests added"
  fi

  # Check against expected
  if [ $EXPECTED_NEW_TESTS -gt 0 ] && [ $DIFF -lt $EXPECTED_NEW_TESTS ]; then
    echo "   ⚠️  Expected $EXPECTED_NEW_TESTS new tests, got $DIFF"
  fi
fi

# Offer to save new baseline
echo ""
echo "💾 Current test count: $TEST_COUNT"
echo "   To update baseline: echo $TEST_COUNT > $BASELINE_FILE"

# Show new files
NEW_FILES=$(git status --short | grep "^??" | cut -c4-)
if [ -n "$NEW_FILES" ]; then
  echo ""
  echo "📄 New files (untracked):"
  echo "$NEW_FILES"
fi

echo ""
echo "✅ Verification complete"
