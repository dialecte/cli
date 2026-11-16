### Added

- `dialecte lot land <id> [--draft]`: a lot lands through its pull request. Its worktree must be clean and on the lot's branch, origin must be reachable; it is rebased onto `origin/<base>` when behind (a conflict is undone and its files named, nothing pushed), pushed with a lease pinned to the head its last landing pushed (a branch it never pushed must not exist on origin), its open pull request reused or a new one opened (titled with its commit message; a closed one replaced), then queued (`gh pr merge --auto`: the merge queue merges it once its checks pass on top of main). `--draft` opens a draft and never queues it, CI running on every push. The landing is recorded in `<lot folder>/landing.json` and as the lot's hand-over entry (`pending`). Landing again once the pull request merged at the lot's tip marks the lot committed; commits made since are refused (a new lot). A lot cut from another lot is refused until stacks land. The host is GitHub through `gh`, which never prompts; another host is another adapter.

### Changed

- `lot close` first marks committed each lot whose landing's pull request merged at the head it pushed (the merge queue squashes, so the lot's own commits never reach main), then closes as for any committed lot.
