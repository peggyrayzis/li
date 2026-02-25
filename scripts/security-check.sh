#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

errors=0

if ! command -v rg >/dev/null 2>&1; then
	echo "ERROR: ripgrep (rg) is required for scripts/security-check.sh" >&2
	exit 1
fi

record_error() {
	echo "ERROR: $*" >&2
	errors=$((errors + 1))
}

scan_tracked_secret_files() {
	while IFS= read -r file; do
		case "$file" in
		.env)
			record_error "Tracked env file detected: $file"
			;;
		.env.*)
			if [[ "$file" != ".env.example" ]]; then
				record_error "Tracked env variant detected: $file"
			fi
			;;
		*.pem|*.p12|*.pfx|*.jks|*.key|*id_rsa*|*id_ed25519*)
			record_error "Tracked secret-like file detected: $file"
			;;
		esac
	done < <(git ls-files)
}

scan_pattern() {
	local label="$1"
	local regex="$2"
	local matches
	matches="$(git ls-files -z | xargs -0 rg --line-number --pcre2 -I --no-messages -- "$regex" || true)"
	if [[ -n "$matches" ]]; then
		record_error "Potential secret pattern found (${label}):"
		echo "$matches" >&2
	fi
}

scan_tracked_secret_files

scan_pattern "AWS Access Key" "AKIA[0-9A-Z]{16}"
scan_pattern "AWS STS Key" "ASIA[0-9A-Z]{16}"
scan_pattern "GitHub token" "gh[pousr]_[A-Za-z0-9_]{30,}"
scan_pattern "Slack token" "xox[baprs]-[A-Za-z0-9-]{10,}"
scan_pattern "Google API key" "AIza[0-9A-Za-z_\\-]{35}"
scan_pattern "OpenAI key" "sk-[A-Za-z0-9]{32,}"
scan_pattern "Private key block" "-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----"
scan_pattern "LinkedIn li_at token" "li_at\\s*[:=]\\s*['\"]?[A-Za-z0-9%_-]{24,}"
scan_pattern "LinkedIn JSESSIONID token" "JSESSIONID\\s*[:=]\\s*['\"]?ajax:[A-Za-z0-9:_-]{16,}"

if [[ "$errors" -gt 0 ]]; then
	echo "security-check failed with ${errors} issue(s)." >&2
	exit 1
fi

echo "security-check passed"
