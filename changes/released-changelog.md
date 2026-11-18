### Added

- `dialecte rules` refuses a change that alters a released `CHANGELOG.md` section (`released-changelog`, no opt-out): lines added, removed or reordered under an already released version, the section removed, or its heading repeated. It judges against the base branch and where the change left it, so a release or a correction made on main after the branch point is no finding.
- `dialecte contrib`'s changelog row checks the released sections on every run, changed by the lot or not, so a merge that folds entries into a released version fails it; its record is keyed on the base branch's `CHANGELOG.md`.
- `dialecte changelog check --base <revision>` judges the released sections against that commit alone; the CI template's check job runs it on every pull request and merge-queue entry (`ci sync` writes the step).
