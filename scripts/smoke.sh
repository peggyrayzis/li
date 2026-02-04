#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

OTHER_PROFILE_URL="${LI_SMOKE_OTHER_PROFILE_URL:-https://www.linkedin.com/in/mnmagan}"
COUNT="${LI_SMOKE_COUNT:-3}"

run() {
	echo "==> $*"
	"$@"
}

expect_failure() {
	echo "==> (expect fail) $*"
	if "$@"; then
		echo "Unexpected success: $*" >&2
		exit 1
	fi
	echo "    failed as expected"
}

run pnpm build

CLI=(node dist/cli.js)

run "${CLI[@]}" check --json

echo "==> ${CLI[*]} whoami --json"
WHOAMI_JSON="$("${CLI[@]}" whoami --json)"
OWN_USERNAME="$(
	printf "%s" "$WHOAMI_JSON" | node -e 'const fs=require("fs"); const d=JSON.parse(fs.readFileSync(0,"utf8")); console.log(d.profile?.username ?? "");'
)"
if [[ -z "$OWN_USERNAME" ]]; then
	echo "Could not determine username from whoami output." >&2
	exit 1
fi
echo "    username=$OWN_USERNAME"

run "${CLI[@]}" profile "$OWN_USERNAME" --json
run "${CLI[@]}" profile "https://www.linkedin.com/in/$OWN_USERNAME" --json

run "${CLI[@]}" connections -n "$COUNT" --json
run "${CLI[@]}" connections -n "$COUNT" --json --of "$OTHER_PROFILE_URL"

echo "==> ${CLI[*]} messages -n $COUNT --json"
MESSAGES_JSON="$("${CLI[@]}" messages -n "$COUNT" --json)"
CONVO_ID="$(
	printf "%s" "$MESSAGES_JSON" | node -e 'const fs=require("fs"); const d=JSON.parse(fs.readFileSync(0,"utf8")); console.log(d.conversations?.[0]?.conversationId ?? "");'
)"
if [[ -n "$CONVO_ID" ]]; then
	echo "==> ${CLI[*]} messages read $CONVO_ID -n $COUNT --json"
	if ! "${CLI[@]}" messages read "$CONVO_ID" -n "$COUNT" --json; then
		echo "    messages read failed (non-fatal)"
	fi
else
	echo "    no conversations found; skipping messages read"
fi

run "${CLI[@]}" invites --json

if [[ -f "www.linkedin.com.fullv3.har" ]]; then
	run "${CLI[@]}" query-ids --json --har "www.linkedin.com.fullv3.har"
else
	echo "==> skipping query-ids (HAR missing: www.linkedin.com.fullv3.har)"
fi

expect_failure "${CLI[@]}" connect "$OTHER_PROFILE_URL"
expect_failure "${CLI[@]}" send "$OTHER_PROFILE_URL" "smoke test message"
expect_failure "${CLI[@]}" invites accept "123"

echo "Smoke test completed."
