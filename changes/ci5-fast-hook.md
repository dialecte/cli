### Added

- `dialecte.gate.hook`: the steps `gate --hook` runs, declared beside `fast`, `full` and `release`; a package whose full suite runs on CI commits on its fast tier. Without it the hook runs as before (the `full` steps but the scoped ones that count no tests). The cli declares `check` and its scoped `tests`: a commit runs the tests the change reaches, the full suite runs on CI.

### Changed

- The cli's scoped `tests` step leaves a changed path no test can import (the manifest, the entry, the vitest config, a setup file, a file a test reads) to the full suite on CI, saying `scoped tests: left to the full suite on CI, no test here can import: <paths>`, instead of running the whole suite on the machine; the selection records those paths as skipped (`left-to-ci`). A production change no longer adds every test that spawns the cli entry either: those run on CI.
- A hand-over's rehearsal of a merge lot in a package declaring `dialecte.gate.hook` no longer reuses the tip's commit hook record (the fast tier): it needs a green `gate --full` record of the tip's tree; the card under a declared hook list keeps a full record's test steps as their own lines, never answered by the hook's.
- A scoped step in the hook list alone now makes the gate base resolved (card, rehearsal plan, hand-over), and the hand-over hands it down to its commits' hooks.
