### Fixed

- `lot close`, `lot prune` and `lot close --feature` keep every lot file of a landed or canceled lot's worktree, not only the root's: each package's `.dialecte/lot.json` (the folder of a `package.json` git tracks, or one the lot deleted) is archived in the lot's folder as `lots/<package path>/lot.json`, or `lot.landed.json` beside one holding other bytes, before the worktree goes. Before, a non-empty package lot file kept the worktree for good.
- A lot file counts as archived only against an archive of its own package path; before, any archive of the worktree's hand-overs matched any lot file.
