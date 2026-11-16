### Changed

- `dialecte gate --hook` in a package that declares `dialecte.gate.hook` checks the tdd receipts of the lot before the declared steps, and runs no test: every new or changed case since the lot base (as `gate --full` measures it) proven red then green (or unchanged, accepted, revised), its newest green taken at the production as committed, and the working files the commit for every test or production path (the receipts were taken on them). A green older than the production (a refactor committed after the tests' commit too) fails the hook naming the cases (`stale  <case>`) and the command to run (`dialecte tdd green --base <lot base>`), files left out of the commit fail it naming them, a first commit and a merge commit skip the step with their reason. A failed tdd step runs no declared step. Without a declared hook list the hook runs as before, with no tdd step.
- The cli's own commit hook runs `check` and `rules` (on the touched files) after the tdd receipts, no test suite: CI runs the whole suite on every push. `gate --fast` keeps its scoped tests.

### Fixed

- `dialecte gate --hook` off a terminal (a commit hook under husky) prints each line once: the running line, the step lines and a given store's notice were printed live and then again in the result.
