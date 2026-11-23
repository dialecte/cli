### Changed

- **Breaking:** `dialecte worktree prune --reclaim` and `--reclaim --dry-run` exit 1 when a worktree is kept because the processes are not known, a process list that cannot be read at all included. They exited 0 before. A worktree kept for any other reason (a lot, a lock, recent activity, a process working in it) still exits 0.

### Fixed

- `dialecte worktree prune --reclaim` no longer stops when the process list cannot be read (the lister throws): each worktree that reaches the process rule is kept, its line saying the processes are not known, at the plan and before each move, and nothing of it is moved.
