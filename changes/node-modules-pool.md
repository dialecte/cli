### Fixed

- The `node_modules` pool keys its entries on the lock key (what `package-lock.json` installs, blind to the package's own name and version), never on a hash of the whole file: an entry parked before a release bump is taken by the next worktree. An entry written by an older cli (no `lockKey`) is never taken; the next park of its repository trashes it.
- `worktree add --json` says why it did not take from the pool: `nodeModules.miss` is `pool empty`, `no entry for install <key>`, `entry busy` or `cross-device`.

### Changed

- The pool holds up to the most lots of the repository open at once (at least 2, at most 8) and at most 2 entries of one lock key; parking past either trashes the oldest. A take prefers the newest entry parked by the same owner among those of its key.
