# li — LinkedIn CLI

A CLI for LinkedIn. Cookie auth, Voyager API, agent-friendly.

```bash
npm install -g @peggyrayzis/li
li whoami
```

## Why This Exists

Bird proved the model: skip OAuth app registration, use your browser cookies, talk to the platform's internal API, and wrap it all in a fast CLI that agents and humans both love.

LinkedIn has no equivalent. The tools that exist are either scraping-only, require OAuth app setup, or are abandoned side projects. `li` fills that gap.

## Quick Start

### 1. Get Your Cookies

Open LinkedIn in Chrome, then:

1. Open DevTools (`Cmd+Option+I` / `Ctrl+Shift+I`)
2. Go to **Application** → **Cookies** → `https://www.linkedin.com`
3. Copy the values for `li_at` and `JSESSIONID`

### 2. Set Environment Variables

```bash
export LINKEDIN_LI_AT="your-li-at-value"
export LINKEDIN_JSESSIONID="your-jsessionid-value"
```

### 3. Verify It Works

```bash
li check    # Validates your session
li whoami   # Shows your profile info
```

## Commands

Note: v0.1 is read-only. Write commands (connect, send, invites accept) are disabled and will return an error. These are planned for v0.2.

### Identity

```bash
li whoami                    # Show logged-in user (name, headline, follower/connection counts)
li whoami --json             # Output as JSON

li check                     # Validate session and show credential source
li check --json
```

### Profile

```bash
li profile peggyrayzis                              # View by username
li profile https://linkedin.com/in/peggyrayzis      # View by URL
li profile --json peggyrayzis                       # Output as JSON
```

### Connections

```bash
li connections                  # List your connections (default: 20)
li connections -n 50            # Show 50 connections
li connections -n 150           # Paginate to return more than 50
li connections --all            # Fetch all connections (paginated)
li connections --start 20       # Pagination offset
li connections --json           # Output as JSON
```

### Connection Requests (v0.2)

```bash
li connect peggyrayzis                              # Send connection request
li connect peggyrayzis --note "Great talk!"         # Include a note (max 300 chars)
li connect --json peggyrayzis
```

### Invitations

```bash
li invites                      # List pending invitations
li invites list                 # Same as above
li invites list --json          # Output as JSON
li invites accept INV123        # Accept an invitation by ID (v0.2)
```

### Messages

```bash
li messages                     # List recent conversations
li messages list -n 10          # Show 10 conversations
li messages --json              # Output as JSON

li messages read CONV123        # Read messages in a conversation
li messages read CONV123 -n 50  # Show 50 messages
```

### Send Messages (v0.2)

```bash
li send peggyrayzis "Hey, quick question about your talk"
li send peggyrayzis "Following up!" --json
```

## Global Options

All commands support:

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON for piping to `jq` or agents |
| `--li-at <token>` | Override li_at cookie |
| `--jsessionid <token>` | Override JSESSIONID cookie |
| `--cookie-source <src>` | Cookie source: `chrome` (explicit) or `auto` (default) |
| `-h, --help` | Show help |
| `-V, --version` | Show version |

## Output Modes

### Human (Default)

Pretty terminal output with emoji and color:

```
👤 Peggy Rayzis
   Developer marketing for devtools and AI founders

   📍 San Francisco Bay Area
   🔗 https://linkedin.com/in/peggyrayzis

   👥 1,203 connections  ·  👁️ 4,821 followers
```

### JSON (`--json`)

Structured JSON for agents and scripts:

```json
{
  "profile": {
    "urn": "urn:li:fsd_profile:ABC123",
    "username": "peggyrayzis",
    "firstName": "Peggy",
    "lastName": "Rayzis",
    "headline": "Developer marketing for devtools and AI founders"
  },
  "networkInfo": {
    "followersCount": 4821,
    "connectionsCount": 1203
  }
}
```

## Agent Integration

`li` is designed to be called by Claude, GPT, or any coding agent.

### Filter connections and send personalized DMs (v0.2)

```bash
li connections --all --json | \
  jq -r '.connections[] | select(.headline | test("CTO"; "i")) | .username' | \
  while read user; do
    li send "$user" "Hi! I noticed you're a CTO..."
    sleep 30  # Respect rate limits
  done
```

### Process pending invites

```bash
li invites --json | \
  jq -r '.invitations[] | select(.sharedConnections > 3) | .invitationId' | \
  xargs -I{} li invites accept {}   # v0.2
```

### Check for unread messages

```bash
li messages --json | jq '.conversations[] | select(.unreadCount > 0)'
```

## Library Usage

Use `li` programmatically in your Node.js applications:

```typescript
import { resolveCredentials, LinkedInClient, whoami } from '@peggyrayzis/li';

// Resolve credentials from environment
const { credentials } = await resolveCredentials({});

// Use the high-level commands
const output = await whoami(credentials, { json: true });
console.log(JSON.parse(output));

// Or use the client directly
const client = new LinkedInClient(credentials);
const response = await client.request('/me');
const me = await response.json();
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `LINKEDIN_LI_AT` | Your li_at session cookie |
| `LINKEDIN_JSESSIONID` | Your JSESSIONID cookie (used as CSRF token) |

## Requirements

- Node.js >= 22
- A valid LinkedIn session (logged in via browser)

## Rate Limiting

LinkedIn is aggressive about bot detection. `li` enforces:

- Minimum 500ms between API requests
- Exponential backoff on 429 (rate limit) responses
- Automatic retry with increasing delays

For bulk operations, add your own delays:

```bash
for user in $(cat leads.txt); do
  li send "$user" "Your message"
  sleep 30  # 30 seconds between sends
done
```

## Disclaimer

This tool uses LinkedIn's internal Voyager API with cookie authentication. It is intended for personal use and agent-powered workflows on your own account.

- LinkedIn can change their API at any time
- Aggressive automation may result in account restrictions
- This tool is not affiliated with or endorsed by LinkedIn
- Use responsibly and respect LinkedIn's terms of service

## License

MIT
