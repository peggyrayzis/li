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
