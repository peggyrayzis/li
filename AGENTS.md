# Repository Operating System
Last Updated: 2026-02-25

## Project Context
- `li` is a LinkedIn CLI for agents.
- It provides command-line workflows for authenticated LinkedIn operations with machine-friendly output for automation.
- This repository operating system exists to keep delivery PR-first, secure, and low-noise while the CLI evolves.

## Guiding Principles
- Keep process lightweight: automate enforcement, avoid manual checklists in PR comments.
- Use GitHub Issues as the only task tracker.
- Deliver PR-first from short-lived `codex/*` branches.
- Prefer small, reviewable changes with explicit acceptance criteria.
- Keep repository docs current or remove them.

## Source Of Truth Docs
- `AGENTS.md` (this file): workflow and operating rules.
- `docs/SPEC.md`: product and technical scope.
- `docs/DECISIONS.md`: architecture/process decisions and status.
- `docs/MEMORY.md`: append-only corrections and learned constraints.
- GitHub Issue + PR templates in `.github/`.

## Session Bootstrap Order
1. Pull latest `main` and read open Issue scope.
2. Read `AGENTS.md`, then `docs/SPEC.md`.
3. Read recent entries in `docs/DECISIONS.md` and `docs/MEMORY.md`.
4. Create/switch to `codex/<task-id>` branch (or `scripts/dev-worktree.sh`).
5. Draft implementation plan in the Issue using the role plan field.
6. Implement + validate locally (`npm run check`, `npm run security`, `bash scripts/check-docs.sh`).
7. Open PR with `scripts/open-pr.sh` and request review.

## GitHub Issues Workflow
- Every task starts with an Issue (`task.yml` or `bug.yml`).
- The Issue must define Summary, Scope, Acceptance Criteria, Role Plan, Active Role, and Artifact.
- Update `Active Role` as work advances (`explorer` -> `worker` -> `monitor` -> `reviewer`).
- Link commits/PRs back to the Issue; PR must include `Closes #<issue>`.
- Bugs must include reproduction and expected vs actual behavior before coding.

## Multi-Agent Roles
- `explorer` (read-only): gather context, constraints, and unknowns; no file writes.
- `worker` (workspace-write): implement code/docs/tests for one scoped issue slice.
- `monitor` (read-only): run checks, watch drift/security signals, and summarize failures.
- `reviewer` (read-only): assess regressions, missing tests, and policy violations.

## Quality Gates And Hooks
- Local pre-commit hook:
  - format staged files
  - run one TS static check path (`npm run typecheck`)
- Local pre-push hook:
  - block direct `main` pushes unless `PROJECT_ALLOW_MAIN_PUSH=1`
  - run `npm run check`
  - run `npm run security`
- CI pull_request workflow runs:
  - docs checks (`bash scripts/check-docs.sh`)
  - core checks (`npm run check`)
  - security checks (`npm run security`)
  - smoke checks (`bash scripts/smoke.sh`) when enabled in CI; run this script locally for auth/session or end-to-end CLI changes before opening a PR

## Security Checklist
- No secrets, session cookies, or private keys in tracked files.
- Keep `.env` local; only commit `.env.example`.
- Run `npm run security` before pushing.
- Review external input handling and command argument validation.
- Prefer least-privilege defaults in scripts and automation.

## Memory And Corrections Loop
- Record mistakes, drift causes, and fix patterns in `docs/MEMORY.md`.
- Add one new memory entry after each non-trivial bug/regression fix.
- Convert repeated failures into guardrail tests or script checks.
- If a correction changes process rules, update this file and log a decision.

## Decision Logging
- Log architecture/process decisions in `docs/DECISIONS.md`.
- Required fields: Date, Decision, Status, Rationale, Consequences, Supersedes.
- Mark replaced items as `superseded` instead of deleting history.

## Anti-Staleness Rules
- Managed docs must include `Last Updated: YYYY-MM-DD`.
- `scripts/check-docs.sh` enforces date format, non-future dates, and freshness.
- Freshness is checked only for docs changed in the PR by default.
- Set `DOC_CHECK_ALL_DOCS=1` to force all managed docs freshness.
- Remove or archive stale docs rather than keeping conflicting guidance.

## Definition Of Done
- Linked GitHub Issue has acceptance criteria satisfied.
- Code, tests, docs, and templates are updated (if impacted).
- Required checks pass locally and in CI.
- PR includes concise summary, checks, and review notes.
- Any new decision/memory entries are recorded.

## Git Safety Rules
- Never force-push shared branches unless explicitly coordinated.
- Do not push directly to `main` (hook-enforced).
- Do not use destructive git commands (`reset --hard`, `checkout --`) without explicit approval.
- Keep branches scoped to a single issue/task.
