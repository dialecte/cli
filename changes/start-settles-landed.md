### Fixed

- A lot merged on the host but not closed yet no longer holds its scope: the next `dialecte lot start` or `dialecte lot scope --add` that meets it settles it (a pushed lot read merged by git, else by the host when git cannot tell), writing its landed fact and printing `settled <lot>: …` (`--json`: `settled`). A lot with commits after its landing, or uncommitted changes in its worktree, still holds, printed `! <lot> merged … but <why>: it still holds its scope` (`--json`: `settleWarnings`); a dry run or a simulated start writes nothing.
- Every forecast leaves out such a lot (a lot that still holds work is compared as before), and `dialecte lot forecast` names it: `! <lot>: merged on <base> at <tip>, not settled yet: it holds nothing`.
- A close no longer rewrites a hand-over's registry entry already in the state it records.

### Changed

- **Breaking:** `dialecte lot status --json` reports `checks.worktree: "removed"` for a closed lot whose worktree is gone, and the text form no longer warns `worktree missing` for it; an open lot whose worktree is gone still reads `missing`.
- **Breaking:** `dialecte lot close` on a lot closed already names the id given, then the other id of the same lot: `<id> already closed (<other>)`; with `--json` its outcome's `handover` is the id given (it was the hand-over entry's name) and `also` carries the other id.
