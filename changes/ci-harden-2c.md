### Changed

- `dialecte worktree prune`: a committed hand-over folder and a finished rehearsal clone go to a trash like every other item (a hand-over folder to the workspace's, a rehearsal clone to its own scratch root's, so a move never crosses file systems) - the plan shows the move (`mkdir -p <trash> && mv <folder> <trash>/`) and `--yes` makes it, the folder's removal running in the background from there; a move that cannot be made (another file system, a trash that is no folder) is a `✗` line naming why, nothing deleted. A pool left-over's shown move names its paths the same way.

### Fixed

- The repository's `post-merge` hook (and `post-rewrite` after a rebase, as `git pull --rebase` makes) rebuilds `dist/` in the main checkout (`git pull`, `lot close`'s fast-forward) when the checkout has one, saying so on one line: `node dist/cli.js` no longer reads the store with old code. A linked worktree builds nothing; a failed build prints one line and never fails the merge.
- `handover run`: the `contrib` guard, finding no green contrib record of the tree under this cli's key but one under another key (an installed cli older than the one that ran `dialecte contrib`, or other contrib rows), says so with when it ran and this cli's version.
- `cards.log`: a card whose line passes 64 KiB after its tdd list is cut is kept as its summary (lists and objects as their counts, strings cut, `summary: true`) instead of failing the write; the full card stays in the lot's folder.
