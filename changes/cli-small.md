### Fixed

- `dialecte handover` (every verb) and `dialecte gate` refuse an option their usage lines do not name, or a value option given last without its value: exit 2 with the option and the command's usage (`--json`: `{ error, usage, next: null }`), before anything is read or run. `handover run --dry-run` used to start a real run. `handover run --probe`, which `commit.sh` asks, stays accepted.
- The hand-over card reads BLOCKED with a failed `merges` line when a merge lot not committed yet has no recorded tree, worded as `handover run` refuses it (`lot <n>: tree not recorded: rehearse first ...`); it used to read READY while the run refused.
