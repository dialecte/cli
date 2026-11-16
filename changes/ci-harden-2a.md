### Fixed

- `dialecte lot close`: a lot whose pull request merged at the worktree's HEAD after a push outside `lot land` (the landing record still naming an earlier head) is marked committed, its landing record's head moved to the merged one; merged at a head that is neither, the line names the heads and nothing is marked.
- `dialecte lot close`: a work-in-progress commit only the HEAD reflog holds, changing only the lot's paths and dropped before the lot's final commits were made (a reset to rebuild them), counts as landed; one made after, or touching another file, still keeps the worktree.
- `dialecte lot close <lot id>`: a lot of the store named by its folder (`0124-cli-x`) closes the hand-over entry registering that folder, whatever the entry is named.
- `dialecte lot land`: a branch holding no commit beyond origin's base (a commit the hook refused leaves the work uncommitted) is refused before anything is pushed or asked of the host; the pushed head is recorded right after each push, so a host refusing to open the pull request never makes the next landing's push "outside lot land"; an origin branch the base already holds (no work on it) is pushed over.
