### Added

- The design gate: while a lot's required design is missing, not approved or stale, `tdd red` in its worktree refuses, the commit hook's new `design` step fails a commit of production code on the lot's branch, from any worktree (it runs first, whatever `dialecte.gate.hook` declares; a refused design is recorded in the lot's events), `lot land` refuses after its rebase and pushes nothing, `handover write` refuses a store lot, `lot approve` names it among its reasons and the hand-over card's `design` line fails. Each reads the shared areas of the lot base its run resolved, through git, over the scope and every path the change touches.
- `lot land` records the base's shared areas again after its rebase, so `lot status` names an area the base declared after the lot started.
- The gate's forecast block names where the lot's design stands.

### Changed

- The cli's `dialecte.risk.high` gains its shared concepts: `src/lib/landing/**`, `src/lib/gate-records/**`, `src/lib/pr/**`, `src/lib/plan/**`, `src/lib/risk/**`, `src/lib/design/**`, `src/lib/gate/hook-gate.ts`, `src/lib/gate/hook-tdd.ts`, `src/lib/gate/hook-design.ts` (the gate itself is a shared concept) and `src/lib/tdd/check-tdd-receipts.ts`. A lot touching them now has the high risk class, the effort held to it and its review cap, and needs an approved design. The `risk` key's description says the list means both.
- `lot design --from` accepts a file outside any git work tree, where plans live, and refuses one under a scratch root, the system's temporary folder, `/tmp` or `/private/tmp`. Without the lot's worktree, `lot design` reads the base recorded at the start and says so.
