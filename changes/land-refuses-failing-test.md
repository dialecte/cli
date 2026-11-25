### Added

- A gate test step records, for each run, the test keys it ran and failed (`|<project>| <file>`, or the file alone for vitest's default project) and the failing cases (`<key> > <case path>`), with how its step chose its tests (`all`, `changed` or `scoped`).
- The gate part of a lot's `tests.json` keeps a ledger of the failures still open (`failures`): a failure stays until a newer run ran its key and nothing in that run failed it, or until a whole-suite pass (`gate --full` whose test steps select every test, or `gate --release`). A run that tested nothing, an older run, a run reused from a record older than the failure and a commit hook's run change nothing. A failure that names no file stays until a run passes every file its failing run ran.

### Changed

- **Breaking:** `dialecte lot land` refuses (exit 1, no entry, nothing pushed, no change request) while the lot's `tests.json` holds a failing test, whatever tree it was seen on, or does not read: the refusal names each failing key and its cases, the gate mode and head that saw it, whether that is the committed tree, and the run that clears it (`dialecte gate --<mode>`, or `dialecte gate --release` for a failure no file names; `dialecte tdd green` for a red tdd case). A pass of another tree, or no `tests.json`, lands as before: CI tests the pushed head.
- **Breaking:** `dialecte lot approve` names the same refusal among its reasons, and `dialecte lot review`'s approve line prints it, read by the same reader.
- **Breaking:** `dialecte gate --fast`, `--full` and `--release` in a lot's own worktree first fold the records of earlier runs into the lot's `tests.json`; when that cannot be written the run is refused (exit 1, nothing run), where it used to run and print a `! tests.json not written` warning: a run of the same mode would overwrite the record whose failure was never folded.
- A `tests.json` that does not read, or holds a field its writers never write so, is rewritten with an unknown failure in its gate part instead of losing its records silently; only a whole-suite pass clears it.
- The change request's tests box is ticked for a gate part whose run was flaky in parallel (its serial rerun passed), and left for one holding an open failure. The change request's gate line and `lot review`'s tests line name an unknown failure instead of a gate mode for a part seeded over a damaged `tests.json`.
- A `tests.json` field of the wrong shape refuses the change request's text naming that field, as a gate mode or a case status outside its list already did.
