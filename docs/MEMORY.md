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
