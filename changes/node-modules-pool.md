### Added

- `dialecte worktree prune --reclaim [--dry-run] [--older-than <days>]`: idle worktrees give their `node_modules` back. An idle worktree (no open lot, failed lots included, no open hand-over, no process working in it, not the main checkout, not locked, reached by no link, no git activity in its index, HEAD or reflog for `<days>`, default 2) whose lock key is the main checkout's has its `node_modules` parked in the pool, any other has it moved to `.worktrees/_trash/`; the code is never touched and a `node_modules` link is never followed. A `-round-<n>` throwaway of a closed lot goes to the trash whole. Every rule is checked again just before each move. `--dry-run` prints every line and a total (worktrees, files, size) and moves nothing.
- `DIALECTE_NPM_INSTALL=off`: the cli never runs npm (a machine that must stay offline, a test suite); a worktree the pool cannot serve then gets the copy, the reason recorded, and the hand-over's lock sync refuses the commit with that reason.
- `dialecte worktree prune` sends a `_pool-*` folder without `pool.json` (a park that never finished) to the trash with `--yes` once it is unwritten for 30 minutes and no process works in it; a younger one, or one a process works in, is kept and named.

### Fixed

- The `node_modules` pool keys its entries on the lock key (what `package-lock.json` installs, blind to the package's own name and version), never on a hash of the whole file: an entry parked before a release bump is taken by the next worktree. An entry written by an older cli (no `lockKey`) is never taken; the next park of its repository trashes it.
- `worktree add --json` says why it did not take from the pool: `nodeModules.miss` is `pool empty`, `no entry for install <key>`, `entry busy` or `cross-device`.
- `lot close` no longer keeps a worktree for what the cli or a tool rebuilds: the coverage outDir (read from the main checkout's package), a nested `node_modules` beside its own `package.json`, `.venv/` and `.pytest_cache/`. Agent `.tmp/` files and user settings still keep it, named.
- A park never leaves anything in the worktree: its `.vite` and `.cache` wait under `.worktrees/_trash/`. A park whose eviction or cache removal fails after its entry is written says `parked` with the problem; a failed park whose `node_modules` cannot be renamed back sends its `_pool-*` folder to the trash, never leaving one without `pool.json`.

### Changed

- `dialecte worktree prune --json`: `poolLeftOver` is now a list of prune items (`kind: 'pool left-over'`, with the command or the reason it is kept) instead of a list of folder names.
- A worktree the pool has no exact entry for takes the nearest one (at most 5 packages off) and completes it with `npm install --prefer-offline --no-save`, checked; else `npm ci --prefer-offline`; the copy-on-write copy only when `npm ci` fails, its first line recorded. The same order in every repository and in rehearsals. A failed install's partial `node_modules` is moved aside, never deleted. The `worktree add` card says `near`, `installed` or `copy-on-write` with the reason; the step events record `npmCi: true` when npm ran.
- The pool holds up to the most lots of the repository open at once (at least 2, at most 8) and at most 2 entries of one lock key; parking past either trashes the oldest. A take prefers the newest entry parked by the same owner among those of its key; the owner is the lot (`lot start` takes, `lot close` parks, a rehearsal of a lot's hand-over takes and parks).
