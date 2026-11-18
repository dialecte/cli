### Added

- `dialecte doctor --host [--vendor <name>]` runs every read the lot verbs make of the repository's host once, for real, through the same code: the newest merged pull request (read by number, a branch with none, its checks, its queued state), a reference pull request's line comments, and the stack extension; then the host tool's versions against the recorded ones and git against its floor. It prints only those lines. It exits 1 on an error (a read refused, an answer whose shape changed, git below 2.38, no host vendor for the origin); a warning (nothing to probe, the stack extension absent, a tool older than recorded) never fails. `--vendor` names the vendor to probe whatever the origin says.

### Changed

- The cli's own CI runs `doctor --host` on every pull request and merge-queue run, and weekly with a check that the host tool still describes every call the cli makes.
