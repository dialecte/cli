### Added

- The CI check job (`dialecte ci sync`) runs what the commit hook runs and `--no-verify` skips: `dialecte rules --base` over the change, against the base the released changelog step reads (the merge queue's base, else the pull request's first parent), and the package's `npm run skills:check` when it has that script.
