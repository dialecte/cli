### Added

- A lot can be kept on purpose, so its worktree, review throwaways and branches stay after it is committed or canceled: `dialecte lot start <brief> --keep <why>` (or a `keep` field in the brief, never both) records the keep with the lot's first records, and `dialecte lot keep <id> --by <who> --reason <why>` and `dialecte lot unkeep <id> --by <who> --reason <why>` change it later, each a signed line of the lot folder's `keep.jsonl` and a `keep.changed` event. `lot unkeep` is refused from the lot's own worktree or one of its review throwaways. A keep never changes the lot's state, its scope's hold or any guard.
- `dialecte lot report --kept [--json]` lists every lot kept on purpose across the stores, real, simulated and damaged: since when, by whom and why, and whether its worktree and branch are still there.
- `lot report <id>` of a kept lot adds a `kept` line, and a committed or canceled kept lot whose worktree or branch is left names `dialecte lot unkeep` as next; `lot report --feature` marks a kept lot.
- The JSON of `lot status`, `lot answer`, `lot stop`, `lot wait` and `inbox` carries `kept`: `{ reason, by, at }`, the keep file that cannot be trusted, or `null`.

### Changed

- `lot close`, `lot prune` and `worktree prune` keep every item of a kept lot with `kept by decision: <why> (by <who>, <date>)`; `lot prune` reads the keep again at the move, so a keep written after its plan keeps the worktree, the throwaway and every branch. `worktree prune --reclaim` never touches a kept lot's own worktree, and health reports it as no idle worktree.
- A `keep.jsonl` that cannot be read, or holds a line that does not read, keeps the lot (never damaged); `lot keep` and `lot unkeep` refuse it, naming the file to repair.
- `lot stop` refuses to move a damaged kept lot aside; a kept lot stopped stays kept.
- No hint sends a kept lot to `lot close`: `lot status` and `lot wait` leave it out of `also`, `lot land` names the keep and `lot unkeep` instead, and `lot delta --worktree` says its throwaway stays with the lot in place of a removal command.
- `worktree prune` holds every damaged lot's worktree, review throwaways and branch, as `lot prune` and `lot close` already do.
- `lot design --approve` and `--waive` are refused from the lot's `-verify` worktree too, as from its own worktree and review throwaways.

### Fixed

- The health `worktrees` rule compares a lot's worktree by its real path, as git registers it: a worktree its lot names through a linked folder is no longer reported idle.
