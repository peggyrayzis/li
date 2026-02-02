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

**Subagent verification (CRITICAL)**: Background agents may report success even when file changes weren't persisted due to sandbox restrictions. After ANY subagent completes:
1. **Verify file changes exist** - Read modified files or run `git diff` to confirm changes
2. **Run tests** - Confirm test count increased if new tests were expected
3. **Don't trust agent reports alone** - The agent transcript shows intent, not reality

**Prefer foreground agents for file modifications**. Use `run_in_background: false` (the default) for tasks that create or modify files. Reserve background agents for research-only tasks.

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

**False positives**: The secret scanner may flag test mock values like `"test-li-at-token"` or `"mock-jsession"`. These are clearly fake test data, not real secrets. Use `git commit --no-verify` when the scanner flags obvious test mocks. Real secrets look like `AQE...` (base64) or contain actual session data.

### Atomic Commits
When fixing multiple issues or implementing multiple features:
1. **One commit per logical change** - Don't bundle unrelated fixes
2. **Commit order matters** - Foundational changes first (e.g., types before code using types)
3. **Each commit should pass tests** - Don't break the build mid-sequence
4. **Use task lists** - Track what needs committing with TaskCreate/TaskUpdate

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

### Verification After Subagent Work
After a subagent completes (especially background agents), run:
```bash
.claude/hooks/verify-changes.sh [expected_new_tests]
```

This script:
- Shows modified files (confirms changes persisted)
- Runs tests and compares to baseline
- Alerts if fewer tests than expected
- Shows new untracked files

Update baseline after major work: `echo <count> > .claude/test-baseline.txt`

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
│   ├── constants.ts    # Shared constants (URLs, config values)
│   ├── endpoints.json  # Voyager endpoint mapping
│   ├── headers.ts      # Request header construction
│   ├── parser.ts       # Voyager response normalization
│   ├── recipient.ts    # Username/URL/URN → profile resolution
│   ├── rate-limit.ts   # Pacing + exponential backoff
│   ├── types.ts        # ALL normalized types (single source of truth)
│   ├── url-parser.ts   # LinkedIn URLs → URNs + extractIdFromUrn
│   └── config.ts       # Config file loading
└── output/
    ├── human.ts        # Pretty output with emoji + color + formatPagination
    ├── json.ts         # Raw JSON output
    └── types.ts        # Re-exports from lib/types.ts (for backwards compat)
```

### Type Organization
**All normalized types live in `src/lib/types.ts`** — this is the single source of truth. The `output/types.ts` file re-exports these for backwards compatibility. Never define the same type in multiple files.

### Shared Utilities Pattern
When you see duplicate code across commands, extract it:
- **URL/URN parsing** → `lib/url-parser.ts` (e.g., `extractIdFromUrn`)
- **Recipient resolution** → `lib/recipient.ts` (username/URL → profile URN)
- **Pagination formatting** → `output/human.ts` (e.g., `formatPagination`)
- **Constants** → `lib/constants.ts` (e.g., `LINKEDIN_PROFILE_BASE_URL`)

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

## v0.1 Build Order (COMPLETE)

All v0.1 items are implemented. Current test count: **282 tests passing**.

1. [x] Project setup (tsconfig, biome, package.json scripts)
2. [x] `src/lib/auth.ts` - cookie resolution from Chrome + env vars
3. [x] `src/lib/headers.ts` - request header construction
4. [x] `src/lib/client.ts` - LinkedInClient with /me validation
5. [x] `src/lib/parser.ts` - response normalization
6. [x] `src/lib/url-parser.ts` - LinkedIn URLs → URNs
7. [x] `src/output/human.ts` + `src/output/json.ts`
8. [x] `src/commands/whoami.ts` + `src/commands/check.ts`
9. [x] `src/commands/profile.ts`
10. [x] `src/commands/connections.ts`
11. [x] `src/commands/connect.ts` + `src/commands/invites.ts`
12. [x] `src/commands/messages.ts` + `src/commands/send.ts`
13. [x] `src/cli.ts` - wire up Commander
14. [x] README with usage examples

### For future work
Follow TDD for each item:
1. Write tests first
2. Implement to make tests pass
3. Run `pnpm lint:fix` to check code quality
4. Log any significant decisions in DECISIONS.MD
5. Commit with descriptive message

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
