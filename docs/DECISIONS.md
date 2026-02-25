# Decisions Log
Last Updated: 2026-02-25

| Date | Decision | Status | Rationale | Consequences | Supersedes |
| --- | --- | --- | --- | --- | --- |
| 2026-02-25 | Adopt repository operating system with multi-agent roles and PR-first enforcement | active | Reduce process drift and make quality/security checks mechanically enforced | Adds standardized docs/scripts/hooks/templates and CI checks | n/a |
| 2026-02-25 | GitHub Issues become the only task tracker | active | Keep planning and delivery in one auditable system | No parallel `docs/TASKS.md` or duplicate trackers | informal task notes |
| 2026-02-25 | Managed docs moved to `docs/` and stale root markdown retired | active | Remove conflicting guidance and normalize discoverability | `CLAUDE.md`, root `SPEC.md`, and root `DECISIONS.md` are retired | root markdown process docs |
| 2026-02-02 | v0.1 scope is read-only operations | active | Keep first release safe and testable | Write commands remain deferred until explicitly promoted | n/a |
| 2026-02-01 | Stack defaults: pnpm + TypeScript + Vitest + Biome | active | Fast feedback and low tooling overhead | Tooling and scripts assume these defaults | n/a |
