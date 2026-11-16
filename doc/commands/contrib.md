# dialecte contrib

<!-- dialecte-reference: generated from the command map by npm run doc:generate; edit the map, not this block -->

The contributor checks of a dialecte package (profile contributor)

```text
contrib - The contributor checks of a dialecte package (profile contributor)

  dialecte contrib [--no-reuse] [--json]

  after gate --full and before handover: rules on the changed files (against the base of the lot,
    the order the rules step of the gate shares: the recorded base of the store lot, else the
    merge-base with the base branch, as the rules step of the gate takes it, else the last release
    tag <name>@v<version>, every error kept without any; a rehearsal against the tip its last merge
    lot merges, else the gate base of the repository at the HEAD of the lots file: an error on a
    line the base holds is a warning), the "dialecte": { "contrib": { "steps" } } (default: npm run
    doc:build with the generatedDocs restored, npm run type-bench:check), npm run type-narrowing
    when the package has that script and no step runs it (a skip line when it lacks it), no
    dependency named by a local folder, the mutation line when a scope is declared
  the changelog row (after rules): in a package keeping changes/, a change that edits README.md, a
    page under doc/commands/ or the command map adds a changelog fragment changes/<lot>.md, or a
    no-entry note changes/<lot>.none.md saying why; else it fails naming the file
  a step a green gate --full of this tree and install passed with the same command is not run again;
    --no-reuse runs every row
  a step whose run is npm run <script> the package lacks is not wired: it fails, default or
    declared; then no row runs, the others read not run: a step of the list is not wired;
    "dialecte": { "contrib": { "skip": { "<default step>": "<reason>" } } } (dialecte.contrib.skip)
    opts a default step out, a warning with its reason

exit codes:
  2  refused in a consumer (nothing written)
e.g. dialecte contrib
```

Flags: `--no-reuse`, `--json`
<!-- /dialecte-reference -->

- `dialecte contrib [--no-reuse] [--json]` runs the contributor checks of a package whose profile is
  `contributor`, after `gate --full` and before `dialecte handover`, one line per row: `rules` on the files
  changed against HEAD (recorded as `dialecte rules` records it), judged against the lot's base for every
  package, whatever its gate config, in the order the gate's scoped rules step shares (the recorded base commit of
  the store lot whose worktree holds the package, else [the base branch](../../README.md#the-base-branch)'s merge-base with HEAD,
  taken as the gate's scoped rules step takes it, even when it is HEAD's commit, else the package's last release tag
  `<name>@v<version>` reachable from HEAD; a rehearsal's run against the last merge lot's tip, else the base the repository resolves at the lots file's
  HEAD): an error of a quality rule on a line the base already holds is a warning ending
  `(not added by this change)`. Without any of these, every error is kept: no empty-tree softening.
  The contrib record does not hold the base its rules row judged against. Then the package's
  `dialecte.contrib.steps` (default: `docs`, `npm run doc:build` with the `generatedDocs` restored, and `type-bench`,
  `npm run type-bench:check`; `[]` keeps the built-in rows only) run as the gate runs its steps (a default
  step whose npm script is missing fails the run before any row, the built-in `rules` and `release` rows
  included, unless `dialecte.contrib.skip` opts it out with a reason; a declared one fails too), `type-narrowing` (`npm run type-narrowing`) when the package has that script and
  none of its steps runs it (without the script, one line `skip  type-narrowing  no npm script
  "type-narrowing"` before `release`, no row), `release` (no dependency named by a local folder), then `mutation` when the
  package declares a mutation scope (read from the mutation store now, never recorded). A package step a
  green `gate --full` record of this tree and install passed with the same name and command is not run
  again: its row says `reused from gate --full at <time>`. The run is recorded as `dialecte-gate-contrib.json`
  in the worktree's git folder and stored by tree like a gate record, its key holding HEAD too (the rules
  row reads the changed files against it); a green record of the same key answers the rows
  (`reused: contrib green on this tree at <time> (HEAD <sha>)`), `--no-reuse` runs them and every step a
  `gate --full` passed. Exit 0 green, 1 a row failed, 2 refused (a consumer, where nothing is written, or
  a value of package.json no command accepts). `--json`: `{ profile, rows: [{ name, status, detail }],
  reused?: { at, head } }`.
