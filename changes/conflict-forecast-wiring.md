### Changed

- `lot start`: a scope meeting an open lot whose work reads goes ahead, printed `shares <met> with <lot> (forecast
  clean)`; a damaged or unreadable lot, a met lock file or a forecast that cannot run still refuse (`--overlap-ok`
  passes what names its paths, as before); the new lot's own forecast is recorded, and an `--overlap-ok` the forecast
  did not need prints `--overlap-ok not needed: the forecast cleared <lot>`.
- `lot scope --add`: an add meeting an open lot is refused only on a forecast conflict between the two lots' work
  (its files and ranges), a met lock file, or a forecast that cannot run; a clean pair adds with no overlap record.
- `lot land`: the committed head is forecast against the fetched base before any rebase or push, a conflict refused
  with its files and ranges; the pairs with the other open lots are printed for information.
- `gate --fast` and `--full` in a lot's worktree forecast the lot as their last step (a warning only: the verdict and
  exit never change); the card gains a `conflicts` line, its scope line the open lots it shares entries with, and
  `lot status --json` a `forecast` view, a pair seen from either lot.
- `plan next`: a ready lot meeting an open lot is proposed with `shares:` when that lot's last forecast clears the
  met entries; `after` is gone, two ready lots that meet are both proposed.
- A pair whose lots both change a lock file reads `exclusive` even when it merges clean; the forecast of a lot that is
  not open returns a refusal instead of throwing.
