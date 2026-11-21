### Fixed

- `lot close`, `lot prune` and `lot close --feature` keep every lot file of a landed or canceled lot's worktree, not only the root's: each package's `.dialecte/lot.json` (the folder of a `package.json` git tracks, or one the lot deleted) is archived in the lot's folder as `lots/<package path>/lot.json`, or `lot.landed.json` beside one holding other bytes, before the worktree goes. Before, a non-empty package lot file kept the worktree for good.
- A lot file counts as archived only against an archive of its own package path; before, any archive of the worktree's hand-overs matched any lot file.
- `lot close` reads every lot file it counted again right before the move: one rewritten since the close decided keeps the worktree, naming it, with nothing archived; an archive is never written over one and is read back, and a write that fails keeps the worktree with its error.
- `worktree prune` (and every removal outside `lot close`) no longer counts a landed lot's live lot files as archived: only `lot close` archives a lot's own lot files, so a worktree whose lot file nothing archived is kept.
