### Changed

- The base branch is read where it is newest: the local branch or origin's, whichever is ahead, origin's when they diverged (the remote is the truth once a merge queue lands on the host). Every reader follows: the gate base, `worktree add`, `tdd`, the rules base, `mutants`, `worktree prune`, `lot close`, the hand-over target. A lot's own branch is still read locally.
- `worktree add` without `--from` fetches origin before it cuts the branch (a failed fetch is one `origin` line on its card, the last known refs read).
- `lot close` fetches origin first and fast-forwards the local base branch: `<branch> fast-forwarded to origin/<branch> <commit>`, or why not (the main checkout holds changes; it holds commits origin lacks).
