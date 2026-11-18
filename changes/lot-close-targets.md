### Changed

- `dialecte lot close <lot id>` closes the lot itself: a lot with no registry entry closes from its own landing, and no registry entry is made for it any more. A canceled lot closes too, its landing never read. An open lot is kept with `lot <name> <state>: <why not landed>`.
- `dialecte lot close` with an argument that names nothing still closes the others, and lists it; the exit code is 2.
- A second `lot close <lot>` after its worktree went answers `already closed` (exit 0) when a recorded removal moved it, else `nothing to close` (exit 1).
- `dialecte worktree prune` no longer removes a store lot's worktree, review throwaway or branch, and reads no landing: a committed or canceled lot's items are listed as its own, naming `dialecte lot close <lot>`.

### Fixed

- `lot close` archives a landed or canceled lot's own `.dialecte/lot.json` in its lot folder by the hand-over archive rule (`lot.json`, else `lot.landed.json` beside one holding other bytes, never over one), and reads a hand-over lot's landed fact through its `.dialecte/lot` link: a worktree whose declaration changed after the hand-over archived it no longer stays forever.
- A store lot whose branch and worktree are gone (it landed through an old hand-over) reads its landing from its final card line when that card is its own, or a hand-over's on its branch whose entry names its worktree, written since the lot was made: `lot close` records its landed fact instead of leaving it working.
- A landed lot with a pending registry entry closes on the first `lot close`: its entry is committed and read as committed in the same run. Every hand-over entry of a closed worktree records its close, so a later `lot close` of it answers `already closed`. The card line of a lot closed with no registry entry carries no card.
