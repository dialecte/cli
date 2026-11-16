### Added

- `dialecte health [--since <date|duration>] [--repository <name>] [--json]`: what wastes time, read from the records the cli already writes - duplicate work (a run on a tree a green record already answered, with both keys and the parts that differed), slow landings (a `handover run` over 5 minutes broken down per commit hook), stalled runs (with the command that resumes them), idle worktrees, slow worktree adds and leaked scratch folders (idle worktrees and leaked scratch are amber, listed after the runs). Reads only; exit 1 on a red finding.
- `dialecte inbox` prints the health findings of the last 24 hours first (`--json`: `health`); a red finding counts as waiting, an amber one is listed only.
- Step events: a gate, contrib or commit-hook `step.end` carries the `key` of the record its run stored; a rehearsal's `step.end` carries its `lots` (lot, tree, decision).
