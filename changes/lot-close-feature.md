### Added

- `dialecte lot close --feature <name> [--json]` closes a feature at a pipeline's last step. It reads the feature's lots in every store of the list and refuses, exit 2, while one of them is neither committed nor canceled, listing each with its state. Otherwise it closes every lot worktree and recorded review throwaway of the feature on `lot prune`'s own proofs, leaves the branches to `lot prune` and does not list them, and moves the feature's dead rehearsal clones (their owner gone, or its pid reused) to their trash, each with `removing` and `removed` lines by `lot-close`. A clone that is alive, whose marker cannot tell, or that rehearses another hand-over stays, named for `dialecte worktree prune`; one a link reaches stays, naming the link. A lot kept on purpose keeps every item, its clones included. Exit 0 when every item of the feature went, 1 when one stayed or the feature has no lot.

### Changed

- `worktree prune --yes` moves a dead rehearsal clone of the workspace's own `.worktrees/_scratch` into `.worktrees/_trash`, as it does a scratch folder there, instead of a `dialecte-trash` beside it.
