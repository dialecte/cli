### Added

- `dialecte lot start <brief.json> --from <lot>` rebuilds a canceled lot: it copies the canceled lot's tdd receipts into the new lot, and `tdd red` then carries the canceled lot's red for each passing case whose test code and production are byte-identical to what that lot proved, flagged `carried` and naming the lot, instead of refusing it as proving nothing; any other case is judged as before, and greens always run again.
