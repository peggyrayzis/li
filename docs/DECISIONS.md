# Decisions Log
Last Updated: 2026-03-17

| Date | Decision | Status | Rationale | Consequences | Supersedes |
| --- | --- | --- | --- | --- | --- |
| 2026-03-17 | Retire the in-repo `@steipete/sweet-cookie` patch and track upstream `0.2.0` | active | Upstream `v0.2.0` now includes the macOS Chrome `timeoutMs` propagation and Node 22 Chromium sqlite overflow fixes previously carried locally | Dependency updates now come directly from upstream; browser auth still depends on local macOS Keychain/browser permissions and must be validated with smoke checks | Temporarily patch `@steipete/sweet-cookie@0.1.0` in-repo |
| 2026-02-25 | Adopt Changesets-driven automated releases on `main` | active | Current tag-triggered release workflow requires manual tag pushes and produced no GitHub releases/changelog history | Release PRs now own versioning/changelog updates; merge triggers npm publish + GitHub release creation | manual tag-push-only release flow |
| 2026-02-25 | Temporarily patch `@steipete/sweet-cookie@0.1.0` in-repo | superseded | Upstream release does not yet include Chrome macOS timeout propagation and Node 22 Chrome sqlite overflow handling | `pnpm.patchedDependencies` carried a local patch until upstream released equivalent fixes | n/a |
| 2026-02-25 | Adopt repository operating system with multi-agent roles and PR-first enforcement | active | Reduce process drift and make quality/security checks mechanically enforced | Adds standardized docs/scripts/hooks/templates and CI checks | n/a |
| 2026-02-25 | GitHub Issues become the only task tracker | active | Keep planning and delivery in one auditable system | No parallel `docs/TASKS.md` or duplicate trackers | informal task notes |
| 2026-02-25 | Managed docs moved to `docs/` and stale root markdown retired | active | Remove conflicting guidance and normalize discoverability | `CLAUDE.md`, root `SPEC.md`, and root `DECISIONS.md` are retired | root markdown process docs |
| 2026-02-02 | v0.1 scope is read-only operations | active | Keep first release safe and testable | Write commands remain deferred until explicitly promoted | n/a |
| 2026-02-01 | Stack defaults: pnpm + TypeScript + Vitest + Biome | active | Fast feedback and low tooling overhead | Tooling and scripts assume these defaults | n/a |
