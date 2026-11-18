### Added

- `rules` compares the change with its base and warns, with three base-aware rules:
  - `duplicate-read`: an added function that reads the same element and three or more attributes as an existing one (a constant of attribute names counts as three), or whose name shares two words with an existing function it does not call; never against a function it calls, nor against another added function.
  - `shared-export-changed`: an export imported by a file of another folder (a sub-folder counts) that the change newly shares, re-signs (its parameters, its return type, or a type they name in a sibling `.types.ts`), changes the body of, or removes; a barrel and an `index` imported as its folder are followed.
  - `docs-not-updated`: in a contributor library, a public `api.json` entry the change adds, re-signs or removes while no doc page naming it (a Markdown page under `doc/` or the README, by the route's last two segments or its whole route in a code span) was touched.
    They judge against `--base`, else the lot base, else (outside a scoped gate step) the base branch's merge-base, never a release tag, the empty tree nor the gate base. One line says where they stand: `quality: since <short> (<source>)`, or `quality: not run (no lot)` in a scoped gate step outside any lot; a run with no base adds no line. Each takes the `dialecte-allow` opt-out; one is judged unused only in a file the change touches. A run that judged the whole change writes `dialecte-quality.json` in the worktree's git folder. `contrib` never runs them.
- `rules --base <ref>` judges the files changed from the merge-base of `<ref>` and HEAD to the worktree (deletions left out), that merge-base the base of the softening, as a CI checkout needs; files given with it, or a ref naming no commit, exit 2.

### Changed

- The source index (`api find --source`) caches each file's function facts beside its entries: its cache is rebuilt once (schema 2).
- `gate`, `tdd` and `rules` read a `--base` flag through one resolver: `tdd --base` refuses a ref that names no commit (a tree id included).
