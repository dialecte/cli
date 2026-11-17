# dialecte inbox

<!-- dialecte-reference: generated from the command map by npm run doc:generate; edit the map, not this block -->

What waits on someone across every lot store: health findings, questions for a person, questions for a caller, ready hand-overs, failed lots

```text
inbox - What waits on someone across every lot store: health findings, questions for a person, questions for a caller, ready hand-overs, failed lots

  dialecte inbox [--repository <name>] [--simulated] [--json]

  reads every store of the store list and the store of the current folder, and the cli scratch
    folders of the temporary folder, files only: first one line per health finding, red first
    (duplicate work, landing time and slow worktree adds of the last 24 hours; stalled runs, idle
    worktrees and leaked scratch folders as they are now), <✗|!> health  <repository>[  <lot>]
    <rule>: <finding>  next: <command>; a red finding waits, an amber one is listed only
  then one line per waiting lot (one per open question), grouped person, caller, ready, failed and
    by index, each with its exact next command; then working <n> · simulated <m>; a lot whose
    records do not read is a damaged line
  --repository - the lots and the health findings of the repository folder of that name only (the
                 basename, exactly), the counts too; the health of no other repository and no
                 scratch folder is read
  --simulated - the simulated lots that wait are listed in their groups (they are only counted
                without it)
  --json - { waiting: the status of each waiting lot, working, simulated, damaged, skipped: the
           stores not read (only when one is), health: the findings (empty when none) }

exit codes:
  1  no lot waits, no lot is damaged and no health finding is red
e.g. dialecte inbox --repository scl
```

Flags: `--repository`, `--simulated`, `--json`
<!-- /dialecte-reference -->

- `dialecte inbox [--repository <name>] [--simulated] [--json]` lists what waits on someone across every store of
  the store list and the store of the current folder. First come the `dialecte health` findings, red first, one
  line each: `<✗|!> health  <repository>[  <lot>]  <rule>: <finding>  next: <command>`. The inbox reads duplicate
  work, landing time and slow worktree adds over the last 24 hours, and stalled runs, idle worktrees and leaked
  scratch folders as they are now; a red finding counts as something waiting, an amber one is listed only. Each
  repository is read with the registry entries its lot lines read. Then one line per open question (person
  questions first, then caller questions), then the ready lots, then the failed ones, by index within a group,
  each line `<index>  <repository>  <branch>  <what>  <next command>`, where `<what>` is `question q<k>
  (person|caller) <question text>`, `READY` or `FAILED  <reason>` and the next command is the lot's own (the
  answer line of that question, `handover show`, `lot result` or `lot stop`); then `working <n> · simulated <m>
  (listed with --simulated)`. `--repository` keeps the lots and the health findings of the repository folder of
  that name, and reads the health of no other repository and no scratch folder; `--simulated` lists the
  simulated lots that wait. A lot folder whose `identity.json` does not read, or whose records do not hold, is a
  `damaged <folder>: <reason>; next: dialecte lot stop <name> --reason <text>` line (a `.tmp-` folder being built,
  or a folder whose name has no lot name's shape, is no lot). The records are checked once, on read: a question id is `q<k>` (k 1 or
  more), an audience `caller` or `person`, a position's step, of and round non-negative integers, a transition's
  `at` a time, an answer file's question its file's `q<k>`. Every lot verb names such a lot damaged (exit 6 for
  `status`, `wait`, `result`; `answer` refuses, exit 2), so no forged field reaches a line or a `next`. It reads
  files only (each registry once per store, the cli scratch folders of the scratch root and, from earlier versions,
  of the system's temporary folder), runs no process,
  writes nothing. `--json`: `{ waiting: [<status of each waiting lot>], working, simulated, damaged, skipped,
  health: [<finding>] }`, `skipped` (the stores not read) only when one is, `health` empty when none. Exit 0 when
  a lot waits, a lot is damaged or a health finding is red, 1 otherwise, 2 for a usage error.
