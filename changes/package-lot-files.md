### Fixed

- `handover run` archives every lot file of the worktree, not only the root's: each tracked package's own `.dialecte/lot.json` is archived in the hand-over folder as `lots/<package path>/lot.json`, emptied, and named by its own `lot file archived:` line, so the next step never inherits a package's entries. When the folder's `lot.json` for that path already holds other bytes, the declaration is archived as `lot.landed.json` beside it, never over it; when both hold other bytes, the lot file is left as it is, naming both.
- `lot recap` lists each package's accepted and revised cases under `In <package path>`, from its archive (`lot.landed.json` first), else its live lot file. The card's tdd section adds one line per package whose own lot file declares something (`<package>: <n> accept, <n> revised, <n> gone`), without judging it. The mutation mode of a hand-over reads the root's `lot.landed.json` first, then its `lot.json`.

### Changed

- `handover run` archives lot files only when the run itself committed lots. A done hand-over run again commits nothing, so it leaves every lot file as it is, writes nothing, and names each non-empty one: `lot file left as it is: <file>`. Before, such a run archived the root's lot file when the folder held no `lot.json` yet.
