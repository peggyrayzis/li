# li Specification
Last Updated: 2026-02-27

## Product Goal
`li` is a Node.js TypeScript CLI for LinkedIn workflows with human-readable output and machine-readable `--json` output.

## Scope (Current)
- Read-focused account and network workflows (`whoami`, `check`, `profile`, `connections`, `search`, `invites`, `messages`).
- Cookie-based authentication via browser/session credentials.
- Voyager endpoint support and normalization utilities.

## Search Command (MVP)
- Command: `li search --query <text>`
- Supported flags: `--json`, `--fast`, `-n/--count`, `--all`
- Temporary hard cap: maximum 50 profiles per search response.
- `--all` requests pagination but is still capped at 50 profiles in MVP.
- JSON output is intentionally minimal in MVP and currently uses top-level keys:
  `{ query, limitApplied, connections, paging }`.

## Out Of Scope (Current)
- Unreviewed write actions that may mutate LinkedIn state by default.
- Long-lived internal process docs outside `AGENTS.md` + `docs/`.
- Alternate task trackers outside GitHub Issues.

## Technical Defaults
- Runtime: Node.js + TypeScript
- Package manager: pnpm
- Tests: Vitest
- Lint/format: Biome

## Quality And Security Expectations
- PR-first workflow from `codex/*` branches.
- Mandatory local checks: `npm run check`, `npm run security`, `bash scripts/check-docs.sh`.
- Secret scanning and docs drift checks are required gates.

## Known Limitations
- `connections --of` relies on upstream LinkedIn search pagination behavior that can be account/session capped (often around two pages, ~20 results) even when additional page requests return HTTP 200.
- `--all` for `connections --of` should be treated as potentially partial under active upstream clamp conditions.
- `search` is currently limited to a maximum of 50 profiles regardless of requested count or `--all`.

## Related References
- Process rules: `AGENTS.md`
- Decisions: `docs/DECISIONS.md`
- Memory log: `docs/MEMORY.md`
