# dialecte mutants

<!-- dialecte-reference: generated from the command map by npm run doc:generate; edit the map, not this block -->

Mutation testing of the declared scope; survivors tracked until handled

```text
mutants - Mutation testing of the declared scope; survivors tracked until handled

  dialecte mutants run [--mode changed|audit] [--base <ref>]
  dialecte mutants status [--json]
  dialecte mutants schedule <follow-up> <key>... | schedule <follow-up> --all-new [--json]
  dialecte mutants abandon <run id> [--json]
  dialecte mutants migrate [--json]
  dialecte mutants judge [--file <file>] [--json]
  dialecte mutants record (--key <key>... | --file <file>) --family <family> --reason <text> [--removable] [--json]
  dialecte mutants drop <run id> [--json]

  run - Stryker on package.json "dialecte": { "mutation" }; changed = the scope lines changed since
        the merge base, audit = the whole scope; without --mode the lot's switch decides
  status - running runs with their age, died runs, new survivors by lot, scheduled by follow-up
  judge - per file, the new survivors with the code around each, its covering tests, a family guess
  record - writes .dialecte/mutation-records.json, then moves the survivors to recorded

exit codes:
  1  run: only when Stryker fails, never on survivors
e.g. dialecte mutants run --mode changed
```

Verbs: `run`, `status`, `schedule`, `abandon`, `migrate`, `judge`, `record`, `drop`

Flags: `--mode`, `--base`, `--json`, `--all-new`, `--file`, `--key`, `--family`, `--reason`, `--removable`
<!-- /dialecte-reference -->

- `dialecte mutants run [--mode changed|audit] [--base <ref>]` runs StrykerJS (resolved from the package,
  its devDependency) on the scope `package.json` declares:
  `"dialecte": { "mutation": { "scope": [...], "exclude": [...], "errorFactories": [...], "fast": { "vitestConfig": "..." }, "full": { "command": "..." } } }`.
  `changed` mutates the scope lines changed since the merge base with the base branch (found as
  [the base branch](../../README.md#the-base-branch) is; with none found, or a `dialecte.baseBranch` naming no branch, the run
  is refused, exit 2, naming `dialecte.baseBranch` and `--base`) or `--base <ref>`, untracked scope files
  whole; `audit` the whole scope (no base needed). Without `--mode` the lot's switch decides; with no switch,
  `changed` when the change touches the scope, else `mutation off for this lot` and exit 0. A detached HEAD is
  refused: a run is filed under its branch. Before Stryker starts, the run is written `running` with its
  process id and that process's start time to `<git-common-dir>/dialecte-mutation/runs/<run id>.json` (every
  worktree of the repository reads it); a run whose process is gone before it reports, or whose pid now
  belongs to a process that started at another time, reads `died`. Every Stryker call names an empty config
  file (`configFile`), so a `stryker.config.json` of the package is never merged in, and only the fast tier is
  incremental. The fast tier runs first, then the timed-out mutants alone, then the declared full tier on the
  survivors no committed record (`.dialecte/mutation-records.json`) lists; the entry is then replaced
  `reported` with the counts, the survivors and the keys of the mutants it detected (killed or timed out), and
  each survivor no record lists enters the ledger (`<git-common-dir>/dialecte-mutation/ledger.json`) as `new`,
  keyed `<package>::<survivor key>`. A `new` or `scheduled` survivor becomes `killed` only when a later run
  detected that exact mutant, and never by a run that started before the last run reporting it (that run tested
  older code); a record with a reason and a family makes it `recorded` (a scheduled one keeps its follow-up
  name). Any other run leaves it as it is: a survivor whose line changed or went away stays pending until the
  lot tests it, records its reason or schedules it. The ledger's readers and writers hold a lock file beside it
  (one whose owner process is gone, or that names no owner and is a few seconds old, is taken over) and first
  take in every reported run the ledger has not taken in yet, in the order they started, so a run whose ledger
  update was missed still reaches it, once. The last lines name the package, lot (the branch), tree (12
  characters), mode, counts, each new survivor `file:line mutation` and each ledger item the run moved
  (`<key>  file:line  killed|recorded`). Exit 1 only when Stryker fails (the run stays `running` until the
  process ends); survivors never fail the command. Reports and sandboxes go under `.tmp/mutants/<run id>/`,
  removed once the run reported. Stryker's incremental file lives in the run's work folder, seeded from and
  written back to `<git-common-dir>/dialecte-mutation/incremental/<package hash>-<key>.json` after a reported
  fast tier. The key holds the whole tree (`.dialecte/` left out), the package's path, the installed lock, the
  linked `file:` dependencies, the fast tier's options, the cli version and the ignorer plugin's bytes, so the
  file is reused on an identical tree only (a rerun, other targets, `changed` then `audit`, another worktree at
  the same tree, a rerun after recording reasons) and never across edits. The store keeps the newest 4 files of
  a package. A write-back that fails prints one warning on stderr and the run goes on.
- `dialecte mutants status [--json]`: the package's running runs with their age, died runs, `new`
  survivors grouped by the lot that first saw them and `scheduled` ones by follow-up.
  `dialecte mutants schedule <follow-up> <key>...` (or `--all-new`) moves `new` survivors to `scheduled`
  under that follow-up (an unknown key refuses the whole call); `dialecte mutants abandon <run id>` marks a
  died run `abandoned` and keeps it (a running or reported run is refused); `dialecte mutants migrate`
  turns `scripts/mutants/equivalent-mutants.json` into `.dialecte/mutation-records.json` (same keys and
  reasons, family `unclassified`, the line's hash), never overwriting an existing file. The store is
  written by the cli only: never edit it by hand.
- `dialecte mutants judge [--file <file>]` prints, per file (sorted), the package's `new` survivors as a judge
  packet: each survivor's key, line and mutation, a family guess with its reason (the first rule its code
  matches: an `errors/` file or error wording, a `.constants.ts` file or a module-level declaration, an
  exhaustive `default:`; `unclassified` when none does), the covering tests the last run that reported it named
  (five, then `…and <n> more`), the code around it as the file is now (5 lines above and below, 21 at most, each
  line cut at 160 characters, the mutated lines marked `>`, `line changed since the run` when its text differs
  from the reported one) and the `record` and `schedule` commands that close it. A packet holds 10 survivors at
  most and its JSON and its text stay within 12000 bytes each: the rest is counted (`…and <n> more survivors`);
  a lone survivor over the cap loses window lines (context first), then test names, then the end of its mutation
  text, each counted. A run entry stores at most five covering test names per survivor, and how many more.
  `dialecte mutants record (--key <key>... | --file <file>) --family <family> --reason <text> [--removable]`
  writes each survivor's record to `.dialecte/mutation-records.json` (family, trimmed reason of at most 200
  characters, the hashes of its line and tests; `removable` for `invariant-guard` and `fallback-never-taken`
  only; other records kept, files and records sorted), then moves each `new` or `scheduled` one to `recorded`
  (a killed or recorded one stays as it is), both under the ledger lock, the records first: a crash between the
  two leaves the survivor `new` until a later run or `record` takes the record in. `--key` repeats or takes
  several keys; `--file` takes every `new` or `scheduled` survivor of the file. An unknown family, `unclassified`,
  an empty or too long reason, `--removable` with another family, an unknown key, or a `--file` holding no `new`
  or `scheduled` survivor refuses the whole call (exit 1, nothing written); both `--key` and `--file`, neither, no
  `--family` or `--reason`, or an option given another of the verb's options as its value (`--reason --json`) is a
  usage error (exit 2). `dialecte mutants drop <run id>` removes an abandoned run, or a reported run, from the
  store; a running or died run (abandon it first) and the latest reported run of its branch (it is that branch's
  evidence: drop it once a newer run of the branch reported) are refused. Every verb but `run` takes `--json` and
  then prints exactly one JSON object on stdout, a refusal included: `{ "verb", "ok": true, ... }` or
  `{ "verb", "ok": false, "reason" }` with the usual exit code (`status --json` prints the status itself).
- A `new` survivor or a died run blocks every hand-over of the package (the card's `mutation` line and
  `handover run`'s guard) until it is killed, recorded, scheduled, rerun or abandoned; a running run blocks a
  merge hand-over and a gate lot; `dialecte worktree prune` keeps the worktree of a running or died run.
