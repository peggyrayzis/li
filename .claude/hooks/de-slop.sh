#!/bin/bash
# De-slop check: validates code quality before commit
# Run manually: .claude/hooks/de-slop.sh

set -e
cd "$(dirname "$0")/../.."

echo "🧹 Running de-slop checks..."

ISSUES=0

# Check for console.log in src/ (except for legitimate output)
CONSOLE_LOGS=$(grep -rn "console\.log" src/ --include="*.ts" | grep -v "// keep" | grep -v output/ | grep -v cli.ts || true)
if [ -n "$CONSOLE_LOGS" ]; then
  echo "⚠️  console.log found in src/ (remove or move to output/):"
  echo "$CONSOLE_LOGS" | head -5
  ISSUES=$((ISSUES + 1))
fi

# Check for commented-out code blocks (3+ consecutive commented lines)
COMMENTED_CODE=$(grep -rn "^[[:space:]]*//.*[{};]$" src/ --include="*.ts" | head -10 || true)
if [ -n "$COMMENTED_CODE" ]; then
  echo "⚠️  Possible commented-out code:"
  echo "$COMMENTED_CODE" | head -5
  ISSUES=$((ISSUES + 1))
fi

# Check for 'any' type usage
ANY_TYPES=$(grep -rn ": any" src/ --include="*.ts" || true)
if [ -n "$ANY_TYPES" ]; then
  echo "⚠️  'any' types found (use specific types):"
  echo "$ANY_TYPES" | head -5
  ISSUES=$((ISSUES + 1))
fi

# Check for TODO/FIXME/HACK comments
TODOS=$(grep -rn "TODO\|FIXME\|HACK\|XXX" src/ --include="*.ts" || true)
if [ -n "$TODOS" ]; then
  echo "📝 TODOs found (resolve or track in issues):"
  echo "$TODOS" | head -5
fi

# Check for extra markdown files
EXTRA_MD=$(find . -maxdepth 1 -name "*.md" -o -name "*.MD" | grep -v README | grep -v CLAUDE | grep -v DECISIONS | grep -v SPEC | grep -v CHANGELOG || true)
if [ -n "$EXTRA_MD" ]; then
  echo "⚠️  Unexpected markdown files (remove or justify):"
  echo "$EXTRA_MD"
  ISSUES=$((ISSUES + 1))
fi

# Check for duplicate exports (same function exported from multiple files)
echo "→ Checking for duplicate function names..."
DUPLICATE_EXPORTS=$(grep -rh "^export function\|^export const\|^export class" src/ --include="*.ts" 2>/dev/null | sort | uniq -d || true)
if [ -n "$DUPLICATE_EXPORTS" ]; then
  echo "⚠️  Possible duplicate exports:"
  echo "$DUPLICATE_EXPORTS" | head -5
  ISSUES=$((ISSUES + 1))
fi

# Check for large files (>300 lines as per spec for client.ts)
echo "→ Checking file sizes..."
LARGE_FILES=$(find src/ -name "*.ts" -exec wc -l {} \; 2>/dev/null | awk '$1 > 300 {print}' || true)
if [ -n "$LARGE_FILES" ]; then
  echo "⚠️  Large files (>300 lines, consider splitting):"
  echo "$LARGE_FILES"
fi

# Run linter
echo "→ Running linter..."
pnpm lint 2>&1 | tail -20 || ISSUES=$((ISSUES + 1))

# Run typecheck
echo "→ Running typecheck..."
pnpm typecheck 2>&1 | tail -20 || ISSUES=$((ISSUES + 1))

echo ""
if [ $ISSUES -eq 0 ]; then
  echo "✅ De-slop checks passed!"
else
  echo "⚠️  Found $ISSUES issue(s) to address"
fi
