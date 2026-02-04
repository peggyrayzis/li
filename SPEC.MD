li — The LinkedIn CLI for agents
Bird for LinkedIn. Cookie auth, Voyager API, agent-friendly.

Post, read, comment, react, and manage your LinkedIn from the terminal — powered by LinkedIn's internal Voyager API and your existing browser session.


Why This Exists
Bird proved the model: skip OAuth app registration, use your browser cookies, talk to the platform's internal API, and wrap it all in a fast CLI that agents and humans both love. LinkedIn has no equivalent. The tools that exist are either scraping-only, require OAuth app setup, or are abandoned side projects.
LinkedIn's internal API ("Voyager") is well-documented by the community, authenticated with a simple li_at cookie, and covers everything you can do on linkedin.com. Someone just needs to package it into a clean CLI.

Design Principles

Cookie auth, no password prompt. Read li_at + JSESSIONID from your browser's cookie store (Chrome, Firefox, Safari) or accept them via env vars / flags. Zero OAuth setup.
Human output by default, --json for machines. Pretty, readable terminal output with emoji and color. --json for piping to jq or feeding to agents. --plain for script-friendly output (no emoji, no color).
CLI first, library second. Ship a CLI binary, but export a LinkedInClient class so it works as an importable Node.js library too.
Own every line. No external LinkedIn API libraries. The Voyager HTTP calls are simple enough to own directly (~300 lines for the core client). Existing community libraries are unreliable — repos go private, maintainers disappear, LinkedIn actively fights them. We use them as reference implementations only.
Undocumented API, expect breakage. LinkedIn can change Voyager endpoints at any time. Be honest about this in the README. Ship endpoint mappings that can be updated without a new release.
Stable endpoints first. v0.1 uses REST-li endpoints with one GraphQL exception: messaging list uses a rotating queryId and a lightweight refresh path. Most GraphQL-dependent features (follower list, following list) are deferred to v0.2 with a fuller queryId maintenance strategy.
Agent-friendly from day one. Designed to be called by Claude, GPT, or any coding agent that can shell out.


Auth Architecture
How LinkedIn Web Auth Works
LinkedIn's web app authenticates via two cookies:

li_at — The primary session token. Long-lived (~1 year). This is the main auth credential.
JSESSIONID — Session identifier, also used as the CSRF token value. Sent as the csrf-token header with every request.

Every Voyager API request requires:
Cookie: li_at=<token>; JSESSIONID=<token>
csrf-token: <JSESSIONID value, with quotes stripped>
User-Agent: <realistic browser UA string>
Cookie Resolution Strategy (mirrors Bird)
Priority order for resolving credentials:

CLI flags: --cookie "li_at=...; JSESSIONID=..." or --li-at <token> --jsessionid <token>
Environment variables: LINKEDIN_LI_AT and LINKEDIN_JSESSIONID
Config file: ~/.config/li/config.json5
Browser cookie stores (auto-extract via @steipete/sweet-cookie):

--cookie-source chrome|firefox|safari (repeatable, sets priority order)
Default order: Chrome → Firefox → Safari (matches Bird)
--chrome-profile-dir <path> for Chromium variants (Arc, Brave, etc.)
--cookie-timeout <ms> for keychain/OS helpers (default 30s on macOS)
macOS: reads from browser SQLite databases / Safari binary cookie files
Linux: reads from Chrome/Firefox cookie stores (set SWEET_COOKIE_LINUX_KEYRING)
Windows: reads from Chrome/Firefox cookie stores (DPAPI decryption)



Cookie Validation
On every invocation, validate the session before making the real request:
GET https://www.linkedin.com/voyager/api/me
If this returns 401/403, emit a clear error:
✗ LinkedIn session expired or invalid.
  Refresh by logging into linkedin.com in your browser, then retry.
  Or set LINKEDIN_LI_AT and LINKEDIN_JSESSIONID env vars.

Endpoint Stability Tiers
LinkedIn's APIs fall into three stability buckets that drive the release plan.
Tier 1 — Stable REST-li (v0.1 read-only)
Standard REST-li protocol with predictable URLs.
EndpointUsed By/me whoami/identity/dash/profiles?q=memberIdentity&memberIdentity={username}profile lookup/messaging/conversations/{id}/eventsread messages
Tier 2 — Flagship SDUI/RSC (v0.1 read-only)
HTML/RSC pagination endpoints that require regex parsing but are currently stable.
EndpointUsed Byflagship-web/rsc-action/actions/pagination?sduiid=com.linkedin.sdui.pagers.mynetwork.connectionsListconnections list/flagship-web/rsc-action/actions/pagination?sduiid=com.linkedin.sdui.pagers.mynetwork.invitationsListinvites list
Tier 3 — GraphQL with Rotating queryId (v0.1 messaging list, v0.2+)
These hit /voyager/api/graphql and require a queryId parameter that rotates on LinkedIn redeployments. When the ID rotates, the endpoint returns 400 until you discover the new ID.
EndpointUsed ByqueryId Patternmessages (list)queryId=<rotating>/voyagerMessagingGraphQL/graphql?queryId=...
queryId maintenance strategy (v0.1 messaging list + v0.2):

Ship known-good queryIds in src/lib/endpoints.json
On 400/404, fetch linkedin.com's HTML/bundles and regex for current IDs
Cache discovered IDs locally at ~/.config/li/queryids.json
li query-ids command for manual refresh (auto-discovery)


CLI Commands
Naming Convention
The binary is li. Commands follow the pattern li <verb> [args] [flags].
v0.1 Commands — Read-only

Note: v0.1 is read-only. Write commands (send, connect, invites accept) are deferred to v0.2.

Messaging (read-only) ⭐ Priority
bash# List conversations (first page only for now; may be incomplete)
li messages [-n 10]                      # Recent conversations (most recent first)
li messages --json                       # Full conversation metadata as JSON

# Read a conversation
li messages read <conversation-id>       # Read by conversation ID
li messages read <conversation-id> -n 50 # Last 50 messages in thread

Query IDs (messaging list)
bash# Refresh/inspect messaging queryId cache
li query-ids
li query-ids --refresh --auto
li query-ids --refresh --har ~/Downloads/www.linkedin.com.har

Debug flags:
FlagDescriptionLI_DEBUG_HTTPLog request status + URLsLI_DEBUG_MESSAGESLog messaging queryId + variablesLI_DEBUG_MESSAGES_RESPONSELog response previews (may include PII)LI_DEBUG_QUERY_IDSLog queryId discovery progress

Connections & Network ⭐ Priority
Connections list uses flagship RSC pagination (no GraphQL, no queryId rotation).
bash# Connection list
li connections [-n 20]                   # Your 1st-degree connections
li connections -n 150                    # Paginate to return more than 50
li connections --all                     # Full list (paginated until exhausted)
li connections --json                    # Connection data as JSON
li connections --of <identifier>         # Connection-of search (total unknown)
li connections --of <identifier> --network 1st,2nd,3rd # Filter connection-of by degree (default: all)

# Invitations (read-only)
li invites                               # Pending connection invitations
li invites --json --include-secrets      # Include invitation IDs/secrets (unsafe, v0.2)

# Profile (dash profile with HTML + /me fallback)
li profile <username>                    # View profile (full when allowed)
li profile <username> --json             # Full profile JSON when dash endpoint permits
Note: if the dash profile request is forbidden (403), the CLI falls back to /me for self profiles.
      The /me payload omits location/industry/summary, so those fields may be blank in v0.1.
Connections pagination detail:
Flagship RSC pagination returns up to 50 connections per request and does not expose a total. CLI reports paging.total as null.

500 connections = ~10 requests
30K connections (LinkedIn max) = ~600 requests

Known limitation (v0.1):
- `connections --of` search results can miss some 1st/3rd degree entries when fetching all pages due to LinkedIn search ranking + pagination behavior. We may address this in v0.1.1.
Network flags:
FlagDescription-nNumber of results (default: 20)--allPaginate through all results (until exhausted)--ofList a connection's connections (username, URL, or URN)--networkFilter connection degrees for --of (1st,2nd,3rd)--fastFaster pacing with adaptive slowdown on rate limits--confirmRequired for bulk operations like --accept-all
What's NOT in v0.1 (deferred to v0.2):

li post — posting (stable endpoint, deferred to cut scope)
li connect — send connection requests (write)
li invites accept — accept pending invites (write)
li send — send DMs (write)
li messages --unread — filter to unread conversations only
li messages --seen — mark conversation as read
li send --stdin — pipe message body from stdin
li followers — full follower list (GraphQL queryId required)
li following — people you follow list (GraphQL queryId required)
li follow <username> / li unfollow <username> — follow without connecting (GraphQL)
li disconnect <username> — remove a connection

Follower/connection counts are available in v0.1 via li whoami. Exact connection counts may be unavailable; display "500+" when needed.
Agent workflow — network management:
bash# Agent checks current counts
li whoami --json  # → {"name": "...", "followers": 4821, "connectionsDisplay": "500+"}

# Agent processes pending invites (v0.2)
li invites --json --include-secrets | jq '.[] | select(.sharedConnections > 3) | .invitationId' | \
  xargs -I{} li invites --accept {}

# Agent filters connections for outreach targets
li connections --all --json | jq '.[] | select(.headline | test("CTO"; "i")) | .username'

Identity & Diagnostics
bashli whoami                              # Show logged-in user (name, headline, URN, counts)
li check                               # Show credential sources and validate session
li help [command]                       # Print help
li --version                           # Print version + git sha

v0.2+ Commands
bash# Posting (stable REST-li, just deferred from v0.1 to cut scope)
li post "Hello LinkedIn!"                  # Text post, public visibility
li post "Check this out" --visibility connections
cat post.txt | li post --stdin

# Followers (requires queryId sniffing)
li followers [-n 20]                     # People who follow you
li followers --count                     # Just the follower count (uses stable endpoint)
li followers --all                       # Full follower list (paginated)

# Following
li following [-n 20]                     # People you follow
li following --count                     # Just the count

# Follow actions
li follow <username>                     # Follow someone (no connection needed)
li unfollow <username>                   # Unfollow someone
li disconnect <username>                 # Remove a connection

# Engagement
li react <post-url> --type like
li comment <post-url> "Great post!"
li repost <post-url>

# Reading
li read <post-url-or-urn>
li feed [-n 10]

# Search
li search "developer marketing" [-n 10]
li search "React developer" --type people

Output Modes
Following Bird's three-tier approach:
Default (Human-Readable)
Rich terminal output with emoji, color (via picocolors), and formatted text:
📝 Post by Peggy Rayzis · 2h ago
Developer marketing for devtools and AI founders

   Just shipped the new positioning for @tamaborhq — "Let your agents
   speak your UI." The key insight: developers don't want AI generating
   new components, they want it using the ones they already built.

❤️ 47    💬 12    🔄 3    👁️ 2,431
https://www.linkedin.com/feed/update/urn:li:activity:1234567890
--json
Raw Voyager API response, lightly normalized:
json{
  "urn": "urn:li:activity:1234567890",
  "author": {
    "urn": "urn:li:member:987654321",
    "name": "Peggy Rayzis",
    "headline": "Developer marketing for devtools and AI founders",
    "username": "peggyrayzis"
  },
  "text": "Just shipped the new positioning...",
  "created": "2025-02-01T10:30:00Z",
  "visibility": "PUBLIC",
  "reactions": { "total": 47, "like": 30, "celebrate": 10, "love": 7 },
  "comments": 12,
  "reposts": 3,
  "impressions": 2431,
  "url": "https://www.linkedin.com/feed/update/urn:li:activity:1234567890"
}
--plain
No emoji, no color, stable format for scripting:
POST urn:li:activity:1234567890
AUTHOR Peggy Rayzis (@peggyrayzis)
DATE 2025-02-01T10:30:00Z
TEXT Just shipped the new positioning...
REACTIONS 47
COMMENTS 12
REPOSTS 3
URL https://www.linkedin.com/feed/update/urn:li:activity:1234567890

Voyager API Layer
Base Configuration
All requests go through:
Base URL: https://www.linkedin.com/voyager/api
Required headers on every request:
Cookie: li_at=<token>; JSESSIONID="<token>"
csrf-token: <JSESSIONID without quotes>
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36
X-Li-Lang: en_US
X-Li-Track: {"clientVersion":"1.13.8201","mpVersion":"1.13.8201","osName":"web","timezoneOffset":-8,"timezone":"America/Los_Angeles","deviceFormFactor":"DESKTOP","mpName":"voyager-web"}
X-Restli-Protocol-Version: 2.0.0
Accept: application/vnd.linkedin.normalized+json+2.1
Endpoint Reference — v0.1 (Read-only)
Messaging Endpoints
CommandMethodEndpointNotesmessages (list)GET/voyagerMessagingGraphQL/graphql?queryId=<hash>&variables=...GraphQL queryId rotates; auto-discovered from HTML/bundles; response key may vary.messages (thread)GET/messaging/conversations/{conversationId}/eventsMessage events in a conversation.

Message response structure:
json{
  "elements": [{
    "dashEntityUrn": "urn:li:fsd_conversation:...",
    "read": true,
    "groupChat": false,
    "totalEventCount": 2,
    "unreadCount": 0,
    "lastActivityAt": 1658148419804,
    "participants": [{ "miniProfile": { "publicIdentifier": "username", "firstName": "..." } }],
    "events": [{
      "createdAt": 1658148419796,
      "eventContent": { "messageEvent": { "body": "Hello!", "attachments": [] } },
      "from": { "miniProfile": { "publicIdentifier": "sender-username" } }
    }]
  }]
}
Connection & Network Endpoints
CommandMethodEndpointNotesconnectionsPOSTflagship-web/rsc-action/actions/pagination?sduiid=com.linkedin.sdui.pagers.mynetwork.connectionsListRSC pagination; max 50 per request; total not exposed.connections --ofPOSTflagship-web/search/results/people/RSC search pagination with connectionOf filter; total not exposed.whoami (counts)GET/meDisplay "500+" when exact count unavailable.profileGET/identity/dash/profiles?q=memberIdentity&memberIdentity={username}Resolve profile URN + fetch dash profile (403 falls back to /me for self).invitations (list)POSTflagship-web/rsc-action/actions/pagination?sduiid=com.linkedin.sdui.pagers.mynetwork.invitationsListRSC pagination for pending invites.
Other v0.1 Endpoints
CommandMethodEndpointwhoamiGET/me + /identity/profiles/{slug}/networkinfo
Endpoint Reference — v0.2+ (GraphQL)
These require queryId management. Not used in v0.1 except for messaging list (see above).
CommandMethodEndpointqueryId Patternfollowers (list)GET/graphql?variables=(start:0,count:20)&queryId=...voyagerIdentityDashFollowers.<hash>following (list)GET/graphql?variables=(start:0,count:20)&queryId=...voyagerIdentityDashFollowing.<hash>followPOST/feed/dash/followingStates/urn:li:fsd_followingState:urn:li:fsd_profile:{id}PATCH: { "patch": { "$set": { "following": true } } }unfollowPOSTsame as followPATCH: { "patch": { "$set": { "following": false } } }searchGET/graphql?...voyagerSearchDashClusters.<hash>feedGET/feed/updatesV2?...reactPOST/normSocialActions/{urn}/reactcommentPOST/feed/commentsdisconnectPOST/identity/profiles/{username}DELETE connection

Note: LinkedIn uses REST-li protocol with a decoration query parameter for field selection. Endpoints may shift between /voyager/api/ and /voyager/api/graphql as LinkedIn migrates internally. The endpoint mapping file should be versioned and updatable.

Rate Limiting & Anti-Bot
LinkedIn is more aggressive than X about bot detection:

Request pacing: Minimum 500ms between API calls. Configurable via --delay.
Session fingerprinting: Send consistent headers that match a real browser session. Never send requests that a browser wouldn't make.
Backoff on 429: Exponential backoff starting at 5s, max 5 retries.
Bulk write pacing: --accept-all runs at 10/minute with jitter.
Connection pagination safety: --all on large connection lists adds 1s delay between pages.
No scraping at scale: This tool is for personal use / agent posting. Explicitly not for mass data extraction.

Error Handling
Map Voyager error responses to clear CLI messages:
HTTP StatusVoyager ErrorCLI Message401UNAUTHORIZED✗ Session expired. Log into linkedin.com and retry.403FORBIDDEN✗ Not authorized for this action. Check your permissions.429THROTTLE✗ Rate limited. Retrying in {n}s...400INVALID_PARAMS✗ Invalid request: {details}404NOT_FOUND✗ Post/profile not found: {urn}999(LinkedIn block)✗ LinkedIn is blocking requests. Try again later or rotate your session.

URL & URN Parsing
LinkedIn uses URNs internally. The CLI should accept either URLs or URNs:
# All equivalent:
li read https://www.linkedin.com/feed/update/urn:li:activity:7294184927465283584
li read https://www.linkedin.com/posts/peggyrayzis_developer-marketing-activity-7294184927465283584
li read urn:li:activity:7294184927465283584

# Profile:
li profile https://www.linkedin.com/in/peggyrayzis
li profile peggyrayzis
The URL parser should handle:

/feed/update/urn:li:activity:* → post URN
/posts/<username>_<slug>-activity-<id> → post URN
/in/<username> → profile username
/company/<slug> → company slug
/jobs/view/<id> → job ID


Configuration
Config file at ~/.config/li/config.json5:
json5{
  // Cookie source priority
  cookieSource: ["chrome", "firefox"],

  // Default visibility for posts
  defaultVisibility: "public",

  // Request pacing (ms between requests)
  delay: 500,

  // Request timeout (ms)
  timeoutMs: 15000,

  // Output mode
  defaultOutput: "human",  // "human" | "json" | "plain"

  // Profiles (switch between LinkedIn accounts)
  profiles: {
    personal: { cookieSource: "chrome" },
    work: { cookieSource: "firefox" }
  }
}
Select a profile: li --profile work post "Company update"

Project Architecture
li/
├── src/
│   ├── cli.ts                    # CLI entrypoint, argument parsing
│   ├── index.ts                  # Library entrypoint (exports LinkedInClient)
│   ├── commands/
│   │   ├── messages.ts             # ⭐ List conversations, read threads
│   │   ├── send.ts                 # ⭐ Send DMs (new + existing threads)
│   │   ├── connections.ts          # ⭐ Connection list, count
│   │   ├── invites.ts              # ⭐ Pending invitations
│   │   ├── connect.ts              # ⭐ Send connection requests
│   │   ├── profile.ts              # View profiles
│   │   ├── whoami.ts               # Identity + network counts
│   │   └── check.ts
│   ├── lib/
│   │   ├── client.ts             # LinkedInClient — core HTTP client (~300 lines)
│   │   ├── auth.ts               # Cookie resolution + validation
│   │   ├── endpoints.json        # Voyager endpoint mapping (updatable)
│   │   ├── headers.ts            # Request header construction
│   │   ├── parser.ts             # Voyager response → normalized objects
│   │   ├── rate-limit.ts         # Request pacing + backoff
│   │   ├── url-parser.ts         # Parse linkedin.com URLs → URNs
│   │   └── config.ts             # Config file loading (JSON5)
│   └── output/
│       ├── human.ts              # Pretty terminal output
│       ├── json.ts               # JSON output
│       └── plain.ts              # Plain text output
├── tests/
│   ├── unit/                     # Unit tests (mocked API)
│   ├── integration/              # Live API tests (opt-in, requires session)
│   └── fixtures/                 # Sample Voyager responses
├── package.json
├── tsconfig.json
├── biome.json                    # Linting (following Bird's choice)
└── README.md
Notably absent from src/commands/: post.ts (v0.2), followers.ts, following.ts, follow.ts (v0.2, requires GraphQL queryId infrastructure).
Technology Choices
ChoiceRationaleTypeScriptMatches Bird. Strong typing for complex Voyager responses.No external LinkedIn libraryOwn every line. Community libs (tomquirk, scrapin-io) are unreliable — repos go private, queryIds go stale. Use as reference only.Node.js ≥ 22Required by @steipete/sweet-cookie for node:sqlite.Bun binaryOptional standalone binary build, like Bird.pnpmPackage manager, like Bird.BiomeLinter/formatter, like Bird.@steipete/sweet-cookieCross-platform cookie extraction (v0.9.0). Proven in Bird.picocolorsTerminal colors (tiny, fast).JSON5Config files with comments.vitestTesting (fast, TypeScript-native).
Library API
typescriptimport { LinkedInClient, resolveCredentials } from '@peggyrayzis/li';

// Resolve cookies from browser
const { cookies } = await resolveCredentials({ cookieSource: 'chrome' });
const client = new LinkedInClient({ cookies });

// ⭐ Messaging
const conversations = await client.getConversations({ count: 10, unreadOnly: true });
const thread = await client.getConversation('peggyrayzis', { count: 50 });
await client.sendMessage('peggyrayzis', 'Hey! Loved your post on devtools positioning.');
await client.markConversationSeen(conversationId);

// ⭐ Connections & Network
const me = await client.getMe(); // name, headline, URN, follower/connection counts
const connections = await client.getConnections({ count: 20 });
const allConnections = await client.getConnections({ all: true }); // paginated
await client.connect('potential-client', { note: 'Great talk at the conference!' });
const invites = await client.getInvitations();
await client.acceptInvitation(inviteId);

// Profile
const profile = await client.getProfile('peggyrayzis');

Agent Integration Patterns
Claude Code / Claude Desktop
bash# ⭐ Agent-powered outreach (v0.2): filter connections, DM matches
li connections --all --json | jq -r '.[] | select(.headline | test("CTO"; "i")) | .username' | while read user; do
  profile=$(li profile "$user" --json)
  li send "$user" "$(echo $profile | generate-dm.sh)"
  sleep 30
done

# ⭐ Agent processes connection requests (v0.2)
li invites --json --include-secrets | jq -c '.[] | select(.sharedConnections > 2)' | while read invite; do
  li invites --accept $(echo $invite | jq -r '.id')
done

# Agent checks network counts
li whoami --json  # → {"name": "...", "followers": 4821, "connectionsDisplay": "500+"}
MCP Server (future)
A natural extension is wrapping li as an MCP server:
json{
  "mcpServers": {
    "linkedin": {
      "command": "li",
      "args": ["mcp-serve"],
      "env": {
        "LINKEDIN_LI_AT": "...",
        "LINKEDIN_JSESSIONID": "..."
      }
    }
  }
}
Tools exposed: linkedin_get_messages, linkedin_get_connections, linkedin_get_invites, linkedin_profile, linkedin_whoami. (Write tools deferred to v0.2)

Release Plan
v0.1 — Messaging + Connections MVP (2–3 weeks)
All stable REST-li endpoints except messaging list, which uses a rotating GraphQL queryId.

whoami, check (auth validation + network counts)
messages (list conversations, read threads, mark seen)
send (DM a connection — new and existing threads)
connections (list, count, paginate)
connect (send connection request with optional note)
invites (list + accept + accept-all)
profile (view profile including network stats)
Cookie auth from env vars + Chrome
Human + JSON output modes
npm publish as @peggyrayzis/li
README with honest disclaimers

v0.2 — Posting + Followers + GraphQL Layer (1–2 weeks)
Adds posting (stable endpoint, just deferred for scope) and introduces queryId sniffing for follower/following lists.

post (text only, public visibility)
followers (list, count, paginated)
following (list, count)
follow, unfollow
disconnect (remove connection)
connections --all improvements (progress bar, resume)
li update-endpoints (manual queryId refresh)
queryId auto-discovery from webpack bundles on failure
~/.config/li/queryids.json cache
--plain output mode
Firefox + Safari cookie extraction

v0.3 — Engagement + Reading (1–2 weeks)

react, unreact, comment, repost
read (single post)
feed (home feed)
send --media (message attachments)
messages --archive
Config file support

v0.4 — Search & Media (1–2 weeks)

search (posts, people, companies, jobs)
post --media (images, video)
post --article (link previews)
comments, thread (post conversations)
mentions, notifications
Bun standalone binary
Endpoint updater script

v0.5+ — Extensions

mcp-serve (MCP server mode)
analytics (company page stats)
post --draft, post --schedule
InMail support (premium accounts)
Group messaging
Windows support


Risks & Mitigations
RiskImpactMitigationLinkedIn changes REST-li endpointsv0.1 commands breakEndpoint mapping in endpoints.json, updatable without code change. REST-li endpoints historically stable.GraphQL queryId rotation (v0.1 messaging list)Conversation list breaksAuto-sniff from webpack bundles, cache locally, degrade to cached/stale queryId until refreshed.Messaging rate limitsDMs throttled or blockedReactive: back off on 429. README documents safe pacing (~30s between sends).LinkedIn detects bot messaging patternsAccount restriction or messaging banRealistic pacing, jitter between sends, no templated mass sends, clear README warningsLinkedIn blocks cookie-based API accessTool stops working entirelyMonitor for signs. Fall back to official OAuth as degraded mode.LinkedIn TOS enforcementAccount banBig disclaimer in README. Personal use, not scraping. Same risk profile as Bird for X.Cookie extraction breaks across OS updatesAuth fails on some platformsUse sweet-cookie (maintained by Bird ecosystem). Fall back to env var / manual cookie entry.Connection-only messaging restrictionCan't DM non-connectionsDetect and surface clear error. InMail support for premium accounts in v0.5.Community library disappearanceNo reference implementationsOwn every line. Libraries used as reference only, not runtime dependencies. Already happened with tomquirk repo going private.

Naming
li — two characters, instantly recognizable. Matches LinkedIn's own internal abbreviation (all URNs start with urn:li:). Published as @peggyrayzis/li.
bashnpm install -g @peggyrayzis/li
li whoami
Not a standard POSIX utility. No meaningful conflicts.

Open Questions
None — all v0.1 questions resolved:

Cookie extraction library: Use @steipete/sweet-cookie (v0.9.0, npm published, Node ≥22). Same as Bird.
Message attachments: Not in v0.1. Text-only DMs. Endpoint needs HAR capture for v0.3.
Connection request limits: No warning. No tracking. Same reactive-only approach as Bird.
