# Decisions Log

This file tracks architectural and implementation decisions made during development. Updated after each milestone.

---

## Template

### [Date] Decision Title
**Context**: What situation prompted this decision?
**Options considered**:
1. Option A - pros/cons
2. Option B - pros/cons

**Decision**: What was chosen and why
**Consequences**: What this means going forward

---

## Decisions

### 2026-02-02 Connections - Flagship Web Pagination API
**Context**: REST endpoint `/relationships/dash/connections` returned 400 and the UI now loads connections via `flagship-web` SDUI pagination.
**Decision**: Use `flagship-web/rsc-action/actions/pagination` with the `connectionsList` pager for the connections command, parsing the RSC payload to extract names, headlines, and profile URLs.
**Consequences**: Connections now rely on flagship-web responses rather than Voyager REST; parsing is heuristic and may require updates if SDUI payloads change.

### 2026-02-01 Project Setup
**Context**: Initial project scaffolding for v0.1 MVP
**Decision**:
- Using pnpm (matches Bird CLI)
- Using Biome over ESLint (faster, simpler)
- Using Commander for CLI parsing (mature, well-documented)
- Using Vitest (fast, native TS support)
- ESM-only (`"type": "module"`)

**Consequences**: Node >= 22 required, all imports need .js extensions in compiled output

---

### 2026-02-01 Auth Module - Cookie Resolution Priority
**Context**: Need to resolve LinkedIn credentials from multiple sources
**Decision**: Following Bird CLI pattern - priority order:
1. CLI flags (--li-at, --jsessionid)
2. Environment variables (LINKEDIN_LI_AT, LINKEDIN_JSESSIONID)
3. Chrome cookies via @steipete/sweet-cookie (v0.2+)

**Consequences**:
- v0.1 uses only env vars and CLI flags (Chrome extraction deferred)
- JSESSIONID stored with quotes stripped, used as csrf-token header
- Cookie header format: `li_at=<token>; JSESSIONID="<token>"`

---

### 2026-02-01 Headers Module - Voyager API Requirements
**Context**: LinkedIn Voyager API requires specific headers for all requests
**Decision**: Static headers matching browser fingerprint:
- User-Agent: Chrome 120 on macOS (realistic browser UA)
- X-Li-Track: JSON payload with clientVersion, timezone, deviceFormFactor
- X-Restli-Protocol-Version: 2.0.0
- Accept: application/vnd.linkedin.normalized+json+2.1

**Consequences**: Headers are hardcoded for consistency. Future versions may need to update Chrome version in UA string.

---

### 2026-02-01 URL Parser - Flexible Input Handling
**Context**: CLI should accept URLs, URNs, and plain usernames
**Decision**: parseLinkedInUrl() handles:
- Full URLs: /in/username, /posts/..., /company/..., /jobs/view/...
- Raw URNs: urn:li:activity:*, urn:li:member:*, etc.
- Plain strings: treated as profile usernames

**Consequences**: Commands can accept any format, normalized internally before API calls.

---

### 2026-02-01 CLI Structure - Commander with Subcommands
**Context**: Need to wire up all v0.1 commands into a single CLI binary
**Decision**:
- Using Commander.js for CLI parsing (mature, well-documented)
- Subcommands for multi-mode operations (messages list/read, invites list/accept)
- Global options for credentials (--li-at, --jsessionid) applied to all commands
- All commands support --json flag for machine-readable output
- Error handling centralized in handleError() function

**Consequences**: Consistent UX across commands, easy to extend in v0.2

---

### 2026-02-01 Type Consistency - Output vs Parser Types
**Context**: Parser types (lib/parser.ts) differ from output types (output/types.ts) - parser omits profileUrl
**Decision**:
- Keep separate type hierarchies (parser types are raw, output types are display-ready)
- Commands transform parser output to output types by adding derived fields (profileUrl)
- Export output types from index.ts for library consumers

**Consequences**: Clear separation between parsing and presentation layers

---

### 2026-02-02 Profile Fetch - Move to Voyager Dash Endpoint
**Context**: `/identity/profiles/{username}/profileView` returns 410 and is no longer usable.
**Decision**: Fetch profiles via `/identity/dash/profiles/{urn}?decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfile-76`, resolving username/URL/URN to a profile URN first using `q=memberIdentity`.
**Reason**: HAR shows the dash endpoint returning full profile data with a decorationId while the legacy profileView endpoint is deprecated.
**Consequences**: Profile command now performs a lookup request before fetching the full profile payload; decorationId may need updates if LinkedIn changes the schema.

---

<!-- Add new decisions above this line -->
