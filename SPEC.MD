li — A CLI for LinkedIn
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
LinkedIn's Voyager API endpoints fall into two stability categories. This distinction drives our release plan.
Tier 1 — Stable REST-li (v0.1)
These use standard REST-li protocol with predictable URLs. No rotating IDs, no GraphQL. They break only when LinkedIn restructures the endpoint entirely (rare).
EndpointUsed By/mewhoami/identity/profiles/{slug}/networkinfowhoami (follower/connection counts)/identity/profiles/{slug}/profileViewprofile/identity/dash/profilesusername → URN resolution/relationships/dash/connectionsconnections (paginated list)/growth/normInvitationsconnect (send request)/relationships/invitationViewsinvites (list pending)/relationships/invitations/{id}invites --accept/messaging/conversationsmessages (create)/messaging/conversations/{id}/eventsmessages (read/send)
Messaging list exception (v0.1): list conversations uses GraphQL with a rotating queryId (see below).
Tier 2 — GraphQL with Rotating queryId (v0.2+)
These hit /voyager/api/graphql and require a queryId parameter that rotates on LinkedIn redeployments. When the ID rotates, the endpoint returns 400 until you discover the new ID.
EndpointUsed ByqueryId PatternGraphQL followersfollowers (list)voyagerIdentityDashFollowers.<hash>GraphQL followingfollowing (list)voyagerIdentityDashFollowing.<hash>GraphQL search clusterssearch (some modes)voyagerSearchDashClusters.<hash>
queryId maintenance strategy (v0.1 messaging list + v0.2):

Ship known-good queryIds in src/lib/endpoints.json
On 400/404, fetch linkedin.com's webpack bundles and regex for current IDs (~50 lines, 2-3s penalty)
Cache discovered IDs locally at ~/.config/li/queryids.json
li query-ids command for manual refresh
Fallback: degrade to count-only mode (counts come from stable /networkinfo)


CLI Commands
Naming Convention
The binary is li. Commands follow the pattern li <verb> [args] [flags].
v0.1 Commands — Mostly Stable Endpoints

Messaging (DMs) ⭐ Priority
bash# List conversations (first page only for now; may be incomplete)
li messages [-n 10]                      # Recent conversations (most recent first)
li messages --unread                     # Unread conversations only
li messages --json                       # Full conversation metadata as JSON

# Read a conversation
li messages <username>                   # Messages with a specific person
li messages <conversation-id>            # Read by conversation URN
li messages <username> -n 50             # Last 50 messages in thread
li messages <username> --all             # Full thread (paginated)

# Send messages
li send <username> "Hey, quick question" # DM a connection (new or existing thread)
li send <username> --stdin               # Pipe message from stdin
cat outreach.txt | li send <username> --stdin

# Conversation management
li messages <username> --seen            # Mark conversation as read
Send behavior:

If an existing conversation exists with <username>, the message is appended to it.
If no conversation exists, a new one is created (connection required for standard accounts, InMail for premium — v0.5).
<username> accepts a LinkedIn public identifier (peggyrayzis), a profile URL (https://www.linkedin.com/in/peggyrayzis), or a profile URN.

Message flags:
FlagDescription-nNumber of messages/conversations (default: 10)--unreadFilter to unread conversations only--seenMark conversation as read--stdinRead message body from stdin
Agent workflow — outreach from CLI:
bash# Agent reads a lead list, sends personalized DMs
for user in $(cat leads.txt); do
  li send "$user" "$(generate-message.sh $user)"
  sleep 30  # respect rate limits
done

# Agent checks for replies
li messages --unread --json | jq '.[] | {from: .participant, preview: .lastMessage}'

Query IDs (messaging list)
bash# Refresh/inspect messaging queryId cache
li query-ids
li query-ids --refresh --auto
li query-ids --refresh --har ~/Downloads/www.linkedin.com.har

Connections & Network ⭐ Priority
All v0.1 connection commands use stable REST-li endpoints (no GraphQL, no queryId rotation).
bash# Connection list (stable: /relationships/dash/connections)
li connections [-n 20]                   # Your 1st-degree connections
li connections --count                   # Connection count only
li connections --all                     # Full list (paginated, warns if >500)
li connections --json                    # Connection data as JSON

# Connection actions (stable: /growth/normInvitations)
li connect <username>                    # Send connection request
li connect <username> --note "Loved your post on devtools marketing"
li invites                               # Pending connection invitations
li invites --accept <invite-id>          # Accept an invitation
li invites --accept-all                  # Accept all pending (with --confirm)

# Profile (stable: /identity/profiles/{slug}/profileView)
li profile <username>                    # View profile (includes follower/connection count)
li profile <username> --json             # Full profile JSON
Connections pagination detail:
The /relationships/dash/connections endpoint paginates at 40-50 per request using start and count query params. Response includes paging.total for progress tracking.

500 connections = ~10 requests
30K connections (LinkedIn max) = ~600 requests
--all warns before paginating if total > 500

Network flags:
FlagDescription-nNumber of results (default: 20)--countReturn only the count, not the list--allPaginate through all results (with safety warning)--notePersonalized note on connection request (max 300 chars)--confirmRequired for bulk operations like --accept-all
What's NOT in v0.1 (deferred to v0.2):

li post — posting (stable endpoint, deferred to cut scope)
li followers — full follower list (GraphQL queryId required)
li following — people you follow list (GraphQL queryId required)
li follow <username> / li unfollow <username> — follow without connecting (GraphQL)
li disconnect <username> — remove a connection
li messages --unread — filter to unread conversations only
li messages --seen — mark conversation as read
li send --stdin — pipe message body from stdin

Follower/connection counts are available in v0.1 via li whoami (uses stable /networkinfo endpoint). Only the lists for followers/following need GraphQL.
Agent workflow — network management:
bash# Agent checks current counts
li whoami --json  # → {"name": "...", "followers": 4821, "connections": 1203}

# Agent processes pending invites
li invites --json | jq '.[] | select(.sharedConnections > 3) | .id' | \
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
Endpoint Reference — v0.1 (Stable REST-li, plus one GraphQL exception)
Messaging Endpoints
CommandMethodEndpointNotesmessages (list)GET/voyagerMessagingGraphQL/graphql?queryId=messengerConversations.<hash>&variables=...GraphQL queryId rotates; v0.1 fetches the first page only.messages (thread)GET/messaging/conversations/{conversationId}/eventsMessage events in a conversation. Paginate with createdBefore.send (existing)POST/messaging/conversations/{conversationId}/eventsBody: { "eventCreate": { "value": { "com.linkedin.voyager.messaging.create.MessageCreate": { "body": "text", "attachments": [] } } } }send (new)POST/messaging/conversationsBody includes recipients array of profile URNs + message. Creates conversation + sends first message.messages --seenPOST/messaging/conversations/{conversationId}PATCH: { "patch": { "$set": { "read": true } } }messages --unreadGET/messaging/conversations?filters=List(UNREAD)Filters to unread only.
Messaging resolution flow:
When a user runs li send <username> "Hello":

Resolve <username> to profile URN via /identity/dash/profiles?q=memberIdentity&memberIdentity=<username>
Check for existing conversation via /messaging/conversations?q=participants&recipients=List(<profileUrn>)
If conversation exists → POST to /messaging/conversations/{id}/events
If no conversation → POST to /messaging/conversations with recipients array

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
CommandMethodEndpointNotesconnectionsGET/relationships/dash/connections?start={n}&count={n}Paginated. Returns miniProfile per connection. paging.total for count.whoami (counts)GET/identity/profiles/{slug}/networkinfoReturns followersCount + connectionsCount. Fast, always stable.profileGET/identity/profiles/{slug}/profileViewFull profile including network stats.connectPOST/growth/normInvitationsBody: { "inviteeProfileUrn": "urn:li:fsd_profile:...", "message": "optional note" }invites (list)GET/relationships/invitationViewsPending received invitations.invites --acceptPOST/relationships/invitations/{inviteId}Accept with action=accept.
Connections pagination response:
json{
  "elements": [
    {
      "to": "urn:li:person:ABC123",
      "to~": {
        "firstName": { "localized": { "en_US": "Jane" } },
        "lastName": { "localized": { "en_US": "Smith" } },
        "publicIdentifier": "janesmith",
        "headline": { "localized": { "en_US": "Engineering Lead at Acme" } }
      }
    }
  ],
  "paging": {
    "total": 1203,
    "count": 50,
    "start": 0
  }
}
Pagination: increment start by count until start >= paging.total.
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
bash# ⭐ Agent-powered outreach: filter connections, DM matches
li connections --all --json | jq -r '.[] | select(.headline | test("CTO"; "i")) | .username' | while read user; do
  profile=$(li profile "$user" --json)
  li send "$user" "$(echo $profile | generate-dm.sh)"
  sleep 30
done

# ⭐ Agent monitors inbox and drafts replies
li messages --unread --json | jq -c '.[]' | while read convo; do
  echo "$convo" | jq '{from: .participant, message: .lastMessage}'
done

# ⭐ Agent processes connection requests
li invites --json | jq -c '.[] | select(.sharedConnections > 2)' | while read invite; do
  li invites --accept $(echo $invite | jq -r '.id')
done

# Agent checks network counts
li whoami --json  # → {"name": "...", "followers": 4821, "connections": 1203}
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
Tools exposed: linkedin_send_message, linkedin_get_messages, linkedin_get_connections, linkedin_connect, linkedin_get_invites, linkedin_accept_invite, linkedin_profile, linkedin_whoami.

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
