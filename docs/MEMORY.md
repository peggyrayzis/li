# Memory Log
Last Updated: 2026-02-25

Append-only log. Add entries; do not rewrite historical entries except typo fixes.

## 2026-02-25
- Correction: process guidance was fragmented across root markdown files and drifted over time.
- Fix: consolidated process rules into `AGENTS.md`, moved specification to `docs/SPEC.md`, and started managed freshness checks.
- Guardrail: `scripts/check-docs.sh` now validates managed docs dates, template sections, and markdown links.

## 2026-02-25
- Correction: repository mixed `.MD` and `.md` file extensions.
- Fix: normalized markdown file extensions to `.md` and removed stale uppercase root docs.
- Guardrail: future docs updates should only create `.md` files.

## 2026-02-25
- Correction: `@steipete/sweet-cookie@0.1.0` ignored Chrome macOS `timeoutMs` and failed Chrome cookie reads on Node 22 with large `expires_utc` values.
- Fix: applied a local `pnpm` dependency patch to propagate `timeoutMs` in Chrome macOS keychain reads and cast `expires_utc` for Node runtimes without `readBigInts`.
- Guardrail: keep the repository patch until upstream `sweet-cookie` merges/releases equivalent fixes, then remove patch and retest smoke on Node 22.

## 2026-02-25
- Correction: release automation depended on manually pushed `v*` tags, so npm publishes could happen without corresponding GitHub releases or changelog history.
- Fix: switched to a Changesets-driven `main` workflow that opens release PRs, updates `CHANGELOG.md`, and publishes/creates GitHub releases on merge.
- Guardrail: require changesets for user-facing changes so each release has an explicit, reviewable changelog entry.

## 2026-02-25
- Correction: `connections --of <username>` passed the public handle directly into the search `connectionOf` filter, which can return unrelated people instead of the target member's actual network.
- Fix: `connections --of` now resolves usernames/profile URLs to a canonical profile URN first and uses the extracted profile ID in request URL/body filters.
- Guardrail: command tests now cover the profile-resolution request path for `--of` and keep pagination assertions around the resolved profile ID flow.

## 2026-02-25
- Correction: large `connections --of --all` queries can return sparse/unstable pages when fetching a combined multi-degree slice in one pass.
- Fix: default `--all --of` now fetches each degree slice (`1st`, `2nd`, `3rd`) separately and merges by username, while keeping parser fallback for search stream pages that omit strict action-slot metadata.
- Guardrail: parser tests now validate strict vs relaxed action-slot filtering, and command tests cover transient empty pages during `connectionOf` pagination.

## 2026-02-25
- Correction: `connections --of` pagination can be upstream-capped by LinkedIn at roughly two pages even when additional pages are requested and return HTTP 200.
- Fix: kept the flagship `connections --of` flow as the default stable backend and constrained `search/dash/clusters` to explicit experimental opt-in only.
- Guardrail: treat `--of --all` as potentially partial under clamp conditions, and keep any alternate expansion strategies behind feature flags until verified stable.
