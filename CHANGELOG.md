# @peggyrayzis/li

## 0.1.3

### Patch Changes

- Add the new `search` command with parser fallback improvements, richer connection metadata, and smoke-test coverage.

## 0.1.2

### Patch Changes

- ce0c590: Improve `connections --of` reliability by resolving profile identifiers to canonical IDs, hardening sparse-page pagination behavior, removing the unused experimental backend path, and documenting current upstream pagination clamp limitations.

## 0.1.1

### Highlights

- Improved auth request correctness by using local timezone handling for `X-Li-Track` (#6).
- Hardened `connections --of` and profile recipient resolution (#4).
- Increased cookie extraction timeout for more reliable browser session reads (#3).
- Added release automation with changelog + GitHub release + tag flow (#13, #14).

### Pull Requests

- #14 ci: fix trusted publishing in release workflow
- #13 chore: automate releases and prepare v0.1.1
- #12 chore: remove unused claude post-edit hook
- #11 add repository OS workflow, multi-agent config, and enforcement gates
- #6 fix(auth): use local timezone for X-Li-Track
- #4 fix connections --of resolution and resilient profile recipient lookup
- #3 increase timeout for getCookies to 30 seconds
- #1 fix whoami test failures in CI

### Commit Log

- c53b221 ci: fix trusted publishing in release workflow (#14)
- 0837fc3 chore: automate releases and prepare v0.1.1 (#13)
- faa61c3 chore: remove unused claude post-edit hook (#12)
- 464958d increase timeout for getCookies to 30 seconds (#3)
- b47d8d1 add repository OS workflow, multi-agent config, and enforcement gates (#11)
- eab8955 fix(auth): use local timezone for X-Li-Track (#6)
- 7924f3f fix connections --of resolution and resilient profile recipient lookup (#4)
- 3f0fe40 fix whoami test failures in CI (#1)
- 90f68c6 add packageManager field for CI pnpm setup

### Contributors

- @peggyrayzis
- @michael-watson
