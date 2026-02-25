# li — The LinkedIn CLI for agents

Stop opening LinkedIn. Let your agents do it.

```bash
npm install -g @peggyrayzis/li
li whoami
```

> Built by [@peggyrayzis](https://linkedin.com/in/peggyrayzis) of [scale.dev](https://scale.dev) — marketing & GTM for devtools and AI founders.
> Working on something cool? Reach out at **li@scale.dev**.

## Why

I was tired of building growth workflows that depended on Clay — which doesn't have an API. Then I saw [Bird](https://github.com/steipete/bird) (a CLI for Twitter) and thought: LinkedIn needs this.

So I built `li`. Cookie auth, LinkedIn's internal Voyager API, structured JSON output. Now my agents handle prospecting, connection monitoring, and message triage without me ever opening a browser tab.

## Quick Start

### Option A: Auto-extract cookies from Chrome or Safari

```bash
li check
```

On macOS, `li` can read your LinkedIn cookies directly from Chrome or Safari. If it works, you're done. Fair warning — cookie extraction can be flaky depending on your OS and browser version. If it doesn't work, Option B is reliable.

### Option B: Set cookies manually

```bash
# Open Chrome DevTools → Application → Cookies → linkedin.com
# Copy li_at and JSESSIONID values

export LINKEDIN_LI_AT="your-li-at-value"
export LINKEDIN_JSESSIONID="your-jsessionid-value"
li check
```

### Verify

```bash
li whoami          # See your profile
li connections     # List your connections
li messages        # Check recent conversations
```

## Commands

v0.1 is read-only. Write commands (`connect`, `send`, `invites accept`) ship in v0.2.

### Identity

```bash
li whoami                         # Your profile + network counts
li check                          # Validate session, show credential source
```

### Profiles

```bash
li profile peggyrayzis            # View by username
li profile linkedin.com/in/user   # View by URL
```

### Connections

```bash
li connections                    # List connections (default: 20)
li connections -n 50              # Show 50
li connections --all              # Fetch all (paginated)
li connections --of peggyrayzis   # View someone else's connections
```

Note: `li connections --of ...` depends on LinkedIn search pagination behavior. LinkedIn may cap results (often around ~20) even when more pages are requested.

### Invitations

```bash
li invites                        # List pending invitations
```

### Messages

```bash
li messages                       # List recent conversations
li messages read CONV_ID          # Read a thread
li messages read CONV_ID -n 50   # Last 50 messages
```

Every command supports `--json` for piping to `jq` or feeding to agents.

## Agent Workflows

`li` is built for agents. Pipe `--json` output into whatever you want.

### Find CTOs in your network

```bash
li connections --all --json | \
  jq -r '.connections[] | select(.headline | test("CTO"; "i")) | .username'
```

### Check unread messages

```bash
li messages --json | jq '.conversations[] | select(.unreadCount > 0)'
```

### Find CTOs in a connection's network

```bash
li connections --of peggyrayzis --all --json | \
  jq -r '.connections[] | select(.headline | test("CTO"; "i")) | .username'
```

### Export connections to CSV

```bash
li connections --all --json | \
  jq -r '.connections[] | [.firstName, .lastName, .headline, .username] | @csv'
```

## Global Options

| Option | Description |
|--------|-------------|
| `--json` | Structured JSON output |
| `--li-at <token>` | Override li_at cookie |
| `--jsessionid <token>` | Override JSESSIONID |
| `--cookie-source <src>` | `chrome`, `safari`, `none`, or `auto` (default) |
| `--no-progress` | Suppress progress output |
| `-h, --help` | Help |
| `-V, --version` | Version |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `LINKEDIN_LI_AT` | Your li_at session cookie |
| `LINKEDIN_JSESSIONID` | Your JSESSIONID cookie (CSRF token) |

## Requirements

- Node.js >= 22
- A valid LinkedIn session (logged in via Chrome)

## Rate Limiting

LinkedIn is aggressive about bot detection. `li` enforces minimum 500ms between requests with exponential backoff on 429s. For bulk operations, add your own delays between commands.

## Programmatic API

A library API for using `li` in Node.js applications is planned for v0.2.

## Contributing

PRs welcome. Here's the setup:

```bash
git clone https://github.com/peggyrayzis/li.git
cd li
pnpm install
pnpm test        # Run tests
pnpm lint        # Check with Biome
pnpm run build   # Build with tsup
```

This project uses TDD — write tests first, then implement. Tests live in `tests/unit/` and fixtures in `tests/fixtures/`. Run `pnpm test` to confirm everything passes before opening a PR.

A few ground rules:
- **No secrets in code.** Real cookie values, API keys, or PII will be rejected.
- **No external LinkedIn API libraries.** We own the Voyager calls directly.
- **v0.1 is read-only.** Write commands (`send`, `connect`, `invites accept`) are deferred to v0.2.
- **Open an issue first** for large changes so we can discuss the approach.

## Releasing

- Add a changeset for user-facing updates: `pnpm changeset`
- Merge PRs to `main` as usual.
- The `Release` GitHub Action opens/updates a release PR with version bumps + `CHANGELOG.md`.
- Merging that release PR publishes to npm and creates a GitHub release.
- Release notes are auto-generated with pull requests, commit log, contributors, and a compare link.

## Disclaimer

This tool uses LinkedIn's internal Voyager API with cookie authentication for personal use and agent-powered workflows on your own account. LinkedIn can change their API at any time. Aggressive automation may result in account restrictions. Not affiliated with or endorsed by LinkedIn.

## License

MIT
