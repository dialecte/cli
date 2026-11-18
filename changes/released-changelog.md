### Added

- `dialecte rules` refuses a change that alters a released `CHANGELOG.md` section (`released-changelog`, no opt-out): lines added, removed or reordered under an already released version, the section removed, or its heading repeated. It judges against the base branch and where the change left it, so a release or a correction made on main after the branch point is no finding.
- `dialecte contrib`'s changelog row checks the released sections on every run, changed by the lot or not, so a merge that folds entries into a released version fails it; its record is keyed on the base branch's `CHANGELOG.md`.
- `dialecte changelog check --base <revision>` judges the released sections against that commit alone; the CI template's check job runs it on every pull request and merge-queue entry (`ci sync` writes the step).

### Changed

- A repository whose CI files come from `dialecte ci sync` now runs `dialecte changelog check` in CI: a changelog fragment or an Unreleased part of `CHANGELOG.md` it cannot read fails the pull request and the merge queue, where before only `dialecte changelog release` refused it.
