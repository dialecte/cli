### Fixed

- A lot started on another lot that merged its base branch no longer counts the base's commits as its own. Its base is the join of the lines it holds, so its version, scope, tdd cases, quality base and stack rebase take its own work alone, and `dialecte lot land` no longer refuses its title for a version the base branch set. Lines that do not merge clean refuse, naming the ways out: rebase onto the base once the parent landed, or merge the base into the parent first.
- The commit hook's tdd step measures from the lot's base as resolved, not from a merge-base read again.
