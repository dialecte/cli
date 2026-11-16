### Added

- `dialecte worktree prune --reclaim [--dry-run] [--older-than <days>]`: idle worktrees give their `node_modules` back. An idle worktree (no open lot, failed lots included, no open hand-over, no process working in it, not the main checkout, not locked, reached by no link, no git activity in its index, HEAD or reflog for `<days>`, default 2) whose lock key is the main checkout's has its `node_modules` parked in the pool, any other has it moved to `.worktrees/_trash/`; the code is never touched and a `node_modules` link is never followed. A `-round-<n>` throwaway of a closed lot goes to the trash whole. Every rule is checked again just before each move. `--dry-run` prints every line and a total (worktrees, files, size) and moves nothing.
- `DIALECTE_NPM_INSTALL=off`: the cli never runs npm (a machine that must stay offline, a test suite); a worktree the pool cannot serve then gets the copy, the reason recorded.

### Fixed

- The `node_modules` pool keys its entries on the lock key (what `package-lock.json` installs, blind to the package's own name and version), never on a hash of the whole file: an entry parked before a release bump is taken by the next worktree. An entry written by an older cli (no `lockKey`) is never taken; the next park of its repository trashes it.
- `worktree add --json` says why it did not take from the pool: `nodeModules.miss` is `pool empty`, `no entry for install <key>`, `entry busy` or `cross-device`.
- `lot close` no longer keeps a worktree for what the cli or a tool rebuilds: the coverage outDir (read from the main checkout's package), a nested `node_modules` beside its own `package.json`, `.venv/` and `.pytest_cache/`. Agent `.tmp/` files and user settings still keep it, named.

### Changed

- A worktree the pool has no exact entry for takes the nearest one (at most 5 packages off) and completes it with `npm install --prefer-offline --no-save`, checked; else `npm ci --prefer-offline`; the copy-on-write copy only when `npm ci` fails, its first line recorded. The same order in every repository and in rehearsals. A failed install's partial `node_modules` is moved aside, never deleted. The `worktree add` card says `near`, `installed` or `copy-on-write` with the reason; the step events record `npmCi: true` when npm ran.
- The pool holds up to the most lots of the repository open at once (at least 2, at most 8) and at most 2 entries of one lock key; parking past either trashes the oldest. A take prefers the newest entry parked by the same owner among those of its key.
