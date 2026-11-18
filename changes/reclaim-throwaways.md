### Fixed

- `dialecte worktree prune --reclaim` no longer moves a closed lot's `-round-<n>` review throwaway to the trash whole: a reviewer's uncommitted edit, or a commit made on a detached HEAD there, was lost with it. A throwaway is reclaimed like any idle worktree: its `node_modules` parked or trashed, its code and its registration left. An open lot's throwaway is no longer kept for being a round alone.
- `dialecte worktree prune` keeps a worktree a process works in (`a process works in it: pid <pid>`), and every worktree it would remove when the processes cannot be listed.
- `dialecte worktree prune` reads a worktree's ignored entries as `lot close` does: its `.dialecte/lot` view and empty or archived declarations no longer keep it; a note under `.dialecte/` keeps it, named.

### Changed

- One reader for a rehearsal marker answers alive, dead or unknown: a marker that is missing, does not parse, names no pid, or whose running pid's start time cannot be compared reads unknown, never as no run. `worktree prune` keeps today's rule for clones (no marker or a running pid: kept).
