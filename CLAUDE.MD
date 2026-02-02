# li — LinkedIn CLI

A CLI for LinkedIn using cookie auth and the Voyager API. See SPEC.MD for full details.

## How to Work on This Project

### Use Subagents
Offload tasks to subagents to keep the main context clean. Spawn subagents for:
- **Research**: "Use a subagent to study Bird's auth.ts and summarize the cookie resolution pattern"
- **Implementation**: "Use a subagent to implement src/lib/headers.ts with tests"
- **Code review**: "Use a subagent to review src/lib/client.ts for security issues"
- **Exploration**: "Use a subagent to find all Voyager API endpoints in the linkedin-api repo"

When working autonomously, default to using subagents for each build order item. This keeps the main agent focused on orchestration.

### Test-Driven Development
Write tests BEFORE implementation:
1. Create `tests/unit/<module>.test.ts` with expected behavior
2. Run tests (they should fail)
3. Implement `src/<module>.ts` to make tests pass
4. Refactor if needed

Example flow for auth.ts:
```
1. Write tests/unit/auth.test.ts with cases for env vars, Chrome cookies, missing creds
2. pnpm test -- auth (fails)
3. Implement src/lib/auth.ts
4. pnpm test -- auth (passes)
```

### Sandbox Mode
This project runs in sandbox mode. All commands execute in a restricted environment. If a command fails due to sandbox restrictions, check if there's an alternative approach or ask for permission.

### Security: No Secrets in Code
This project will be open source. NEVER commit:
- API keys, tokens, or credentials
- `li_at` or `JSESSIONID` cookie values
- Real email addresses or PII
- `.env` files

Always use `process.env.LINKEDIN_LI_AT` etc. The pre-commit hook will block commits with secrets.

### De-slop: Clean Up After Each Milestone
Before committing, run through this checklist:
- [ ] No duplicate code — extract shared logic into utilities
- [ ] No unused imports or variables (`pnpm lint` catches this)
- [ ] No extra markdown files — only README.md, CLAUDE.MD, DECISIONS.MD, SPEC.MD
- [ ] No console.log debugging statements left behind
- [ ] No commented-out code blocks
- [ ] No `any` types — use proper TypeScript types
- [ ] No hardcoded test data in source files
- [ ] Functions are focused and under ~50 lines
- [ ] File names match exports (auth.ts exports auth functions)

Run `pnpm lint:fix` before each commit.

### Decision Logging
Log significant decisions in `DECISIONS.MD`:
- Architecture choices (why X library over Y)
- API design decisions (why this endpoint structure)
- Trade-offs made (what was sacrificed and why)
- Deviations from SPEC.MD (and justification)

Format:
```markdown
### [Date] Decision Title
**Context**: What prompted this?
**Decision**: What was chosen
**Reason**: Why this over alternatives
```

## v0.1 Scope (Current)

Building the MVP with **stable REST-li endpoints only**. No GraphQL, no queryId rotation.

### v0.1 Commands
- `whoami` - logged-in user info + network counts
- `check` - validate session, show credential sources
- `messages` - list conversations, read threads
- `send` - DM a connection (new + existing threads)
- `connections` - list connections (paginated)
- `connect` - send connection request
- `invites` - list/accept pending invitations
- `profile` - view a profile

### NOT in v0.1 (don't build these)
- `post`, `followers`, `following`, `follow`, `unfollow`, `disconnect`
- GraphQL queryId infrastructure
- Firefox/Safari cookie extraction (Chrome only for v0.1)
- `--plain` output mode (human + json only)

## Tech Stack

- **Runtime**: Node.js >= 22 (required by sweet-cookie)
- **Package manager**: pnpm
- **Language**: TypeScript (strict)
- **Linting**: Biome (not ESLint)
- **Testing**: Vitest
- **Cookie extraction**: @steipete/sweet-cookie
- **Terminal colors**: picocolors
- **Config files**: JSON5

## Project Structure

```
src/
├── cli.ts              # CLI entrypoint (use Commander)
├── index.ts            # Library exports
├── commands/           # One file per command
├── lib/
│   ├── client.ts       # LinkedInClient (~300 lines, owns all HTTP)
│   ├── auth.ts         # Cookie resolution + validation
│   ├── endpoints.json  # Voyager endpoint mapping
│   ├── headers.ts      # Request header construction
│   ├── parser.ts       # Voyager response normalization
│   ├── rate-limit.ts   # Pacing + exponential backoff
│   ├── url-parser.ts   # LinkedIn URLs → URNs
│   └── config.ts       # Config file loading
└── output/
    ├── human.ts        # Pretty output with emoji + color
    └── json.ts         # Raw JSON output
```

## Code Principles

1. **Own every line** - No external LinkedIn API libraries. The Voyager calls are simple enough to own directly. Use community repos as reference only.

2. **Cookie auth, no passwords** - Read li_at + JSESSIONID from Chrome cookie store or env vars. Zero OAuth.

3. **Output modes** - Every command supports `--json` for machines. Default is human-readable with emoji/color.

4. **Minimum 500ms between requests** - LinkedIn is aggressive about bot detection.

5. **Clear error messages** - Map HTTP errors to actionable CLI messages (see SPEC.MD error table).

## Key API Details

**Base URL**: `https://www.linkedin.com/voyager/api`

**Required headers on every request**:
```
Cookie: li_at=<token>; JSESSIONID="<token>"
csrf-token: <JSESSIONID without quotes>
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36...
X-Li-Lang: en_US
X-Restli-Protocol-Version: 2.0.0
Accept: application/vnd.linkedin.normalized+json+2.1
```

**Session validation**: `GET /me` - if 401/403, session expired.

**Username → URN resolution**: `GET /identity/dash/profiles?q=memberIdentity&memberIdentity=<username>`

## Reference Implementation

Follow [Bird](https://github.com/steipete/bird) (Twitter CLI) as the model:
- Cookie resolution strategy
- Output mode patterns (human/json/plain)
- Error handling approach
- CLI structure

## Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Build TypeScript
pnpm test             # Run tests
pnpm test:run         # Run tests once (no watch)
pnpm lint             # Run Biome
pnpm lint:fix         # Fix lint issues
pnpm typecheck        # Type check without emitting
pnpm dev              # Watch mode
```

## Testing Strategy

- **Write tests first** (TDD) - tests define expected behavior before implementation
- **Unit tests**: Mock Voyager API responses. Store fixtures in `tests/fixtures/`
- **Integration tests**: Opt-in with real session. Skip in CI. Gate behind `LINKEDIN_INTEGRATION_TEST=1`
- Test the happy path + error cases (401, 403, 429, 404)
- Tests auto-run on file save via hooks

## Environment Variables

```bash
LINKEDIN_LI_AT=<token>           # Primary session token
LINKEDIN_JSESSIONID=<token>      # CSRF token
```

## v0.1 Build Order

For each item:
1. Write tests first
2. Implement to make tests pass
3. Run `.claude/hooks/de-slop.sh` to check code quality
4. Log any significant decisions in DECISIONS.MD
5. Commit with descriptive message

1. [x] Project setup (tsconfig, biome, package.json scripts)
2. [ ] `src/lib/auth.ts` - cookie resolution from Chrome + env vars
   - Subagent: study Bird's auth pattern first
   - Tests: env var resolution, missing creds error, Chrome cookie extraction mock
3. [ ] `src/lib/headers.ts` - request header construction
   - Tests: builds correct headers from credentials
4. [ ] `src/lib/client.ts` - LinkedInClient with /me validation
   - Tests: successful validation, 401 handling, 429 retry logic
5. [ ] `src/lib/parser.ts` - response normalization
   - Tests: parse profile, parse connections, parse messages
6. [ ] `src/lib/url-parser.ts` - LinkedIn URLs → URNs
   - Tests: profile URLs, post URLs, raw URNs, invalid URLs
7. [ ] `src/output/human.ts` + `src/output/json.ts`
   - Tests: format profile, format connections list
8. [ ] `src/commands/whoami.ts` + `src/commands/check.ts`
9. [ ] `src/commands/profile.ts`
10. [ ] `src/commands/connections.ts`
11. [ ] `src/commands/connect.ts` + `src/commands/invites.ts`
12. [ ] `src/commands/messages.ts` + `src/commands/send.ts`
13. [ ] `src/cli.ts` - wire up Commander
14. [ ] README with usage examples

## Reference Code

- **Bird CLI**: https://github.com/steipete/bird — study auth.ts, output patterns, CLI structure
- **LinkedIn Voyager docs**: https://github.com/tomquirk/linkedin-api — Python, use as API reference only (repo may go private)
- **linkedin-api-js**: https://github.com/eilonmore/linkedin-private-api — TypeScript reference for Voyager patterns

## When Unsure

1. Check SPEC.MD for the answer
2. Follow Bird's patterns when applicable
3. Keep it simple - v0.1 is an MVP
4. Prefer stable REST-li endpoints over anything requiring queryId
5. When in doubt, write a test to clarify expected behavior
