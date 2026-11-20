### Added

- `dialecte lot prune [<id>...] [--feature <name>] [--all] [--yes] [--json]` removes what a committed or canceled lot leaves behind: its worktree, its review throwaways (recorded by a step, or cut by hand at a commit of the lot) and its branches, each item on its own proof. Without `--yes` it prints the plan; `--yes` acts, each proof read again at the move, a branch deleted only at the tip proved. A lot whose worktree is gone and whose landing is not proven is listed stale with the command to stop it; worktrees git refused to delete from the trash are listed with the command to remove them.
- `dialecte lot report` names `dialecte lot prune <lot>` as the next command of a committed or canceled lot whose worktree or branch is still there.

- A git read a `lot prune` decision rests on that fails keeps the item with `could not read <what>: <git's error>`, and each branch's loss is read again right before its delete.

### Changed

- `dialecte worktree prune` lists a committed or canceled lot's items as removed by `dialecte lot prune <lot>`, no longer by `lot close`.

### Fixed

- The lost-work check before a worktree's removal reads the worktree's own refs (`refs/worktree/`, `refs/bisect/`): a commit only they hold is no longer lost with the worktree.
