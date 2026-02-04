#!/bin/bash
# Pre-commit hook: blocks commits containing secrets, PII, or security risks
# Install: ln -sf ../../.claude/hooks/pre-commit.sh .git/hooks/pre-commit

set -e

echo "🔒 Scanning for secrets and PII..."

# Patterns that should NEVER be committed
BLOCKED_PATTERNS=(
  'li_at='
  'JSESSIONID='
  'Bearer [A-Za-z0-9\-_]+'
  'api[_-]?key["\s]*[:=]["\s]*[A-Za-z0-9]+'
  'api[_-]?secret["\s]*[:=]'
  'password["\s]*[:=]["\s]*[^$]'
  'secret["\s]*[:=]["\s]*[A-Za-z0-9]+'
  'token["\s]*[:=]["\s]*[A-Za-z0-9\-_]{20,}'
  'PRIVATE KEY'
  'BEGIN RSA'
  'BEGIN DSA'
  'BEGIN EC'
  'BEGIN OPENSSH'
  'AWS_ACCESS_KEY'
  'AWS_SECRET'
  'LINKEDIN_LI_AT='
  'LINKEDIN_JSESSIONID='
  # PII patterns
  '@gmail\.com'
  '@yahoo\.com'
  '@hotmail\.com'
  'ssn["\s]*[:=]'
  'social.security'
)

# Files to always ignore
IGNORE_FILES=(
  '.claude/hooks/pre-commit.sh'  # This file contains the patterns
  'SPEC.MD'                       # Spec may reference env var names
  'CLAUDE.MD'                     # Docs may reference env var names
  'README.md'                     # Docs may reference env var names
)

# Build ignore pattern for grep
IGNORE_PATTERN=$(printf "|%s" "${IGNORE_FILES[@]}")
IGNORE_PATTERN="${IGNORE_PATTERN:1}"  # Remove leading |

# Get staged files
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -Ev "^($IGNORE_PATTERN)$" || true)

if [ -z "$STAGED_FILES" ]; then
  exit 0
fi

FOUND_SECRETS=0

for pattern in "${BLOCKED_PATTERNS[@]}"; do
  # Search staged content (not just filenames)
  MATCHES=$(git diff --cached -G"$pattern" --name-only 2>/dev/null | grep -Ev "^($IGNORE_PATTERN)$" || true)

  if [ -n "$MATCHES" ]; then
    echo "❌ BLOCKED: Found pattern '$pattern' in:"
    echo "$MATCHES" | sed 's/^/   /'
    FOUND_SECRETS=1
  fi
done

# Check for .env files being committed
ENV_FILES=$(echo "$STAGED_FILES" | grep -E '\.env' || true)
if [ -n "$ENV_FILES" ]; then
  echo "❌ BLOCKED: Attempting to commit .env file(s):"
  echo "$ENV_FILES" | sed 's/^/   /'
  FOUND_SECRETS=1
fi

# Check for HAR files being committed
HAR_FILES=$(echo "$STAGED_FILES" | grep -E '\.har(\.json)?$' || true)
if [ -n "$HAR_FILES" ]; then
  echo "❌ BLOCKED: Attempting to commit HAR capture file(s):"
  echo "$HAR_FILES" | sed 's/^/   /'
  FOUND_SECRETS=1
fi

# Check for hardcoded localhost cookies in source files
COOKIE_IN_SOURCE=$(git diff --cached --name-only -- '*.ts' '*.js' | xargs -I{} git diff --cached -- {} 2>/dev/null | grep -E 'li_at|JSESSIONID' | grep -v 'process\.env' | grep -v '//' || true)
if [ -n "$COOKIE_IN_SOURCE" ]; then
  echo "❌ BLOCKED: Hardcoded cookie values in source code"
  FOUND_SECRETS=1
fi

if [ $FOUND_SECRETS -eq 1 ]; then
  echo ""
  echo "🚫 Commit blocked. Remove secrets/PII before committing."
  echo "   If this is a false positive, use: git commit --no-verify"
  exit 1
fi

echo "✅ No secrets or PII detected"
exit 0
