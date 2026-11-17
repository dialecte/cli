### Fixed

- `lot close` closes a squash-merged lot: the landing state reads a squash offline (the lot's work contained in `origin/<base>`) and asks the host for a lot that was pushed, so a pull request opened by hand counts. A lot id closes with no hand-over entry needed (a merged lot is registered committed), a lot committed through a hand-over without `landing.json` closes once its work is in the base, and the landed lot's own `.dialecte/lot.json` is archived in its folder instead of keeping the worktree.
- `worktree prune` removes a squash-merged lot's worktree (its landed fact written) and its `-round-<n>` and `-verify` throwaways; a lot whose landing git cannot prove (main edited the lines again after the squash) is kept with `landing not provable offline: run lot close <lot>, which asks the host`.
- `lot land` of a stacked lot moves only the lot's own commits: it rebases with `git rebase --onto <base> <fork point>`, the fork point read from git (`merge-base --fork-point`), so a parent amended, rebased or squash-merged by hand is never replayed.
- `lot status` of a stacked lot names the parent's pull request as the host holds it (`open`, `draft`, `queued`, `merged`, `closed`), no longer the parent lot's own state (`ready` after its merge).
- `lot scope --add` of a stacked lot accepts a path of the stack parent's scope, as `lot start --on` does.

### Changed

- One landing state decides "landed" for `lot land`, `lot close`, `worktree prune` and `lot status`: a lot's tip on the base, its pull request merged, or its work contained in the base. The verbs that act write it once as `<lot folder>/landed.json`, which every reader reads as `committed`; `lot status` shows a merged lot committed and writes nothing. The keep rule of close and prune names `<n> commit(s) of work not in <base>: <commits>`: the reflog commits whose work the base does not contain.
- `stack.json` holds the parent lot only (`{ schema, parent }`); `landing.json` no longer records the heads its rebases replaced.
- `lot land` of a lot already merged writes its landed fact, names the commits made since (they land in a new lot) and prints the close line, exit 0 (was refused when commits followed the merge).
- The hand-over card's stack line names the parent and its pull request (`on <parent> (#<n>)`), files only.
- `plan next` no longer probes git for a lot whose hand-over was committed outside its folder, and its `landed` section stays empty: such a lot reads committed once `lot close`, `lot land` or `worktree prune` wrote its landed fact.
