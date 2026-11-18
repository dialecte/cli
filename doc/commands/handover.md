# dialecte handover

<!-- dialecte-reference: generated from the command map by npm run doc:generate; edit the map, not this block -->

The guarded commit-by-lots hand-over a human runs, from a lots file

```text
handover - The guarded commit-by-lots hand-over a human runs, from a lots file

  dialecte handover write <lots.json> [--release] [--target <branch>] [--out <id|folder>] [--rehash] [--json]
  dialecte handover show [<name|folder>] [--json]
  dialecte handover review <name|index|folder> [--json] [--print]
  dialecte handover run [<name|folder>] [--rehearse [--keep] [--full]] [--resume-merge] [--not-a-lot --by <who> --reason <text>]
  dialecte handover abandon [<name|folder>]
  dialecte handover list [--root <dir>] [--json]
  dialecte handover --legend

  write - the hand-over folder (lots.json, snapshot, one-line commit.sh) and its card, registered in
          <git common dir>/dialecte-handover/<name>.json under the real path of the folder; handover
          <lots.json> is the same; --out <id> writes into the lot folder, refused (exit 2, nothing
          written) for a simulated, canceled or failed lot, an open question, a lots file of another
          worktree or branch; any folder whose hand-over is committed is refused
  write --target <branch> - the branch the lots land on, recorded as target in lots.json (default:
    the base branch resolved at write time); a branch with neither a local nor an origin ref is
    refused (exit 2, nothing written)
  show - the card again, recomputed, nothing written; without an argument the newest of the branch;
         BLOCKED with a ! line when the target branch moved past the hand-over (merge it first);
         BLOCKED with a ✗ processes line naming the processes left running in the worktree (no
         terminal, not under an editor, not named in git config dialecte.personProcesses); BLOCKED
         with a ✗ merges line when a merge lot not committed yet has no recorded tree, worded as run
         refuses it
  review - opens the hand-over's worktree in a new editor window, started detached (a hand-over
           holding a merge lot first writes review/lot.diff, the lot's change against head, and
           opens it too); the editor: git config dialecte.editor in the worktree (its words, no flag
           added), else the first known editor found on PATH, else code; never $EDITOR; --print
           prints the command line and starts nothing, --json answers { editor, command, opened };
           refused (exit 2) for an unknown hand-over, a worktree that is gone, an editor not found
  run - what commit.sh runs: each guard with its time, each lot announced, the hook live, the card;
        without a folder the one registered hand-over still to run; --rehearse commits in a scratch
        clone; refuses a canceled lot (exit 2); the lot guard refuses a hand-over folder that is not
        a lot of the store (exit 2) unless --not-a-lot --by <who> --reason <text> gives the
        go-ahead, recorded first as a not a store lot: row of its decisions.md (an existing row
        counts), and always a simulated or damaged lot; a rehearsal prints ! and goes on; holds the
        machine awake while it runs, and a run that spanned a sleep says so on the DONE card; a run
        that committed lots archives every non-empty lot file of the worktree (the root's and each
        tracked package's) in the folder, lots/<package path>/ for a package, lot.landed.json beside
        a lot.json holding other bytes, and empties it; a run that committed none leaves them as
        they are
  abandon - marks a hand-over that will not run (abandoned.json) and releases its lock; refuses a
            lot folder (exit 2): rewrite it with write --rehash --out <full name>, end the lot with
            lot stop
  list - every hand-over folder: repository, worktree, branch, lots, age, state
  --legend - every term of the card, what it means, whether to look

exit codes:
  2  every verb: an option its usage lines do not name, or a value option given last without its value: the usage printed (--json: { error, usage, next: null } where the verb takes --json); nothing read or written
  2  run: the target branch moved past the hand-over (merge it first) or has no ref, a process left running in the worktree or a process list not known, a gate config the cli cannot run, a canceled lot, a hand-over that is not a lot of the store (without --not-a-lot), a simulated or damaged lot, --not-a-lot without --by and --reason (or --by/--reason without it), a forbidden word in --by or --reason; nothing committed
  2  write: a --target branch with neither a local nor an origin ref, no base branch found without --target, an --out the lot folder refuses; nothing written
e.g. dialecte handover write ../handover/lots.json
```

Verbs: `write`, `show`, `review`, `run`, `abandon`, `list`

Flags: `--release`, `--target`, `--out`, `--rehash`, `--json`, `--print`, `--rehearse`, `--keep`, `--full`, `--resume-merge`, `--not-a-lot`, `--by`, `--reason`, `--root`, `--legend`
<!-- /dialecte-reference -->

A CI-first repository never takes a hand-over: there `handover write` (and `handover <lots.json>`) and `handover run`,
rehearsed or not, refuse with exit 2 before anything is written, and name the flow to use instead: commit on the lot
branch through the hook, then `dialecte lot land <id>`. A repository is CI-first when its
`.github/workflows/ci.yml` (the file `dialecte ci sync` writes) runs on `merge_group` and holds the `ci-ok` job: what
the merge queue runs and what its ruleset requires. Nothing is configured: a `ci.yml` without `merge_group`, or no
`ci.yml`, keeps the hand-over flow below. The repository checked is the one the lots file names. `show`, `list`,
`review`, `abandon` and `run --probe` answer as everywhere.

- `dialecte handover write <lots.json> [--release] [--target <branch>] [--out <id|folder>] [--rehash] [--json]` (or `dialecte handover <lots.json>`) prepares the commit-by-lots
  hand-over a human runs. `--target <branch>` names the branch the hand-over must not be behind (default: the
  [base branch](../../README.md#the-base-branch)); it is written as `target` in the lots file. A branch with no ref, local or on
  origin (`--target nope: no such branch, local or on origin`), a `--target` with no branch after it, or no base
  branch to default to, is refused (exit 2, nothing written). `--release` marks it a release hand-over (`"release": true` in the lots file): its card
  then holds a required `gate release` row, green only with a green `gate --release` record of the tree it commits.
  The lots file names the repository, the branch and HEAD expected, and the lots (paths, message):

  ```json
  {
  	"repository": "/path/to/the/repository",
  	"branch": "feat/names",
  	"head": "d4b1c04",
  	"gates": "the scl cases need DIALECTE_SCL_DIR: skipped here",
  	"lots": [
  		{ "paths": ["src/names/"], "message": "feat(names): names stay unique among siblings" },
  		{ "paths": ["CHANGELOG.md"], "message": "docs(changelog): unique names" }
  	]
  }
  ```

  `gates` is optional free text, the caveats for the person about to run the hand-over: the cards printed
  before a run (this one, a rehearsal's) show it as their notes; the card a real run prints after it has
  none. The card reads the gates from their records.
  It refuses (and writes nothing) when the branch or HEAD differ, `core.hooksPath` names a folder that
  does not exist (git would skip every hook; it says how to restore it), something is staged, a changed
  file is in no lot or in two, or a lot file (evals included) or message holds a standard citation, one
  of the package's `referencePatterns`, or, in a contributor, a tag (see [Profiles](../../README.md#profiles)). Otherwise it writes the hand-over folder - the lots file, the snapshot (`files.txt`,
  `files.sha256`, `files.deleted`, and `lots.sha256`: the lots file as reviewed) and a one-line
  `commit.sh` that runs
  `npx --no-install @dialecte/cli handover run <folder>` (bash, also run with `sh`; when the repository
  installs no cli that can, it says so in one line with the fix) - and prints the hand-over card, the
  command with its absolute `cd` under it. The folder is the lots file's, or `--out <id|folder>`: a lot (its
  index, full name, a path to its folder or `.dialecte/lot`) writes into the lot folder, any other word is a
  folder; either way the folder is taken by its real path (a folder not made yet: the real path of its nearest
  existing ancestor, then the rest) before anything is written, so `commit.sh`, the lock, the card, `--json`'s
  `folder` and the registry all hold it. A word naming both an existing folder and a lot is the folder: the
  card's output starts with the note saying so (`outNote` in `--json`). Refused (exit 2, nothing written), when the folder is a lot folder, in
  this order: a damaged lot (`<name> is damaged (<reason>): ...`, naming `lot stop`), a simulated lot (`a simulated lot has no hand-over`), a `canceled` or `failed` lot, an open
  question (`answer q<k> first: dialecte lot answer <full name> q<k> "<answer>" ...`), a lots file whose
  repository is not the lot's worktree or whose branch is not the lot's (both named); and for any folder whose
  registered hand-over is `committed` (`<name> is committed: a committed hand-over is never rewritten`). Every hand-over
  written is registered in the repository's store, `<git common dir>/dialecte-handover/`: shared by every
  worktree of the repository, kept when a worktree is removed, never in the working tree. The store holds
  one entry per hand-over, `<name>.json` = `{ folder, branch, worktree, index, written, state }` (the folder's
  absolute path, the lots file's branch and repository, the worktree's index when its folder is numbered
  (`0171` for `.worktrees/0171-cli-x`, absent otherwise), when it was written, and its state as last
  recorded: `pending` when written, `committed` by a real run that commits every lot, `abandoned` by
  `handover abandon`); the folder stays where it was written. The name is `<yyyy-mm-dd>-<branch slug>[-<n>]` -
  the local date, the branch with every run of characters outside `[A-Za-z0-9._-]` (the `/` included)
  turned into one `-`, then `-2`, `-3`... when that name has an entry already. A folder registered already
  (the same real path) keeps its name: `--rehash` updates its entry, never a second one, and never one
  recorded `committed`. An entry is written whole (a reader sees the old entry or the new one; on a file
  system without hard links a new entry is written exclusively instead) and stays writable, so an older cli
  can still record its state. A rehearsal and `show` write no entry. `--json` answers the card as data: the verdict, `profile`,
  `failedGates`, `otherTreeGates`, `declarations` (the entries to read), `gates` (the gate lines: name,
  status, detail), `contrib` (a contributor's contrib rows, one per row: name, status, detail, and `stale`
  or `source` - `rehearsal`, `from <commit>` - when they apply), `tdd` (the tdd lines as the text a person reads, no layout and no padding), `notes`, `name` (the
  hand-over's registered name; absent for a folder with no entry), `worktree` (absolute), `index` (a
  numbered worktree's), and each lot with
  `pending` until it is committed. Edited a file after the review? `--rehash` (also after
  editing `lots.json`). The repository stays held until every lot is committed: `dialecte gate` runs
  only under this hand-over (see `gate`), and a hand-over of another folder is refused, naming the script
  that holds the repository and its lock.

- The hand-over card is what a person reads before running the hand-over, and again at its end. Its title
  is `hand-over: <repository folder> <branch>`, with the worktree's index first from a numbered worktree
  (`hand-over: 0171 cli feat/x`: the repository's own folder name, so the number is shown once). The commit
  section ends with the `worktree` line: the worktree the lots are committed in, relative to the workspace
  when it is inside it (`.worktrees/0171-cli-x`, `cli` for the main checkout), else its absolute path; both
  compared by real path, so a side reached through a link (`/var` and `/private/var`) reads the same. Its
  first line is the verdict: `READY` when no gate line failed and none ran on another tree, `BLOCKED` with
  `<n> gates failed: <names>` and `gates ran on another tree: <names>`, `DONE` once a real run committed
  every lot; then the lots, files and `+<added> −<removed>` (`all gates green` when nothing blocks), and
  `<n> declarations to read (below)` on a second line. Its sections:
  - `commit`: one line per lot - its sha, or `pending`; its files, lines added and removed, and subject. A
    merge lot's line follows (`merge <branch> at <tip> · <n> conflicts · tree <sha>`, or
    `tree not recorded: rehearse first`); a merge lot is sized from the tree it was trial-merged on to
    the tree a rehearsal recorded, else says `size after rehearse`. Then `HEAD <sha>`, after a run
    `HEAD <base> → <tip> · nothing pushed`.
  - `gates`: one line per gate step from the gate records (the latest record of each step over `--fast`,
    `--full`, `gate --hook`'s record and the commit hook's record, a line of the hook's ending with
    `commit hook`: `✓ test:run  1214/1214 · commit hook`; a gate record newer than the hook's replaces its
    lines whole, since the hook names its own scripts, not the gate's steps; the other way round, a hook record of the
    tree the hand-over commits, not dropped by a newer gate record of that tree, replaces the lines of
    every gate record of another tree it answers - a step of the same name, or a step counting tests when
    the hook counts tests: a merge hand-over rehearsed or committed reads the hook's lines of the merged
    tree, the worktree's `tests` of its tree before the merge left out. No check leaves silently: a step
    the hook did not run reads `! skills  not run on the merged tree` (a warning, not of another tree), a
    failed one stays `✗ ... (the tree changed since)`, and `tdd` stays the worktree's: on the DONE card of a
    merge hand-over the tdd verdict is judged on the worktree's own lot tree (the tree its first merge lot
    merged onto), current while the hook record of the merged tree stands, so no `gates ran on another tree`
    for it; a record counts when its key is the one of the tree the card checks, judged with the hook files and
    gate lists that tree holds - a merge's tree holds its own, whatever the worktree's are now; a hook file git
    does not track is read from disk), then, in a consumer, `mutation` when the package declares a mutation
    scope (below), then `scope` (the lot's scope changes, the overlaps it accepted, and each open lot it shares
    scope entries with: `shares <met> with <lot> (forecast <verdict>, <age>)`), then `conflicts` only on a card
    still to run whose forecast shows a conflict or an unknown (each comparison that does not clear, with what holds
    it and its age, a pair seen from either lot: the newer line wins; a warning, never a block), then
    `review` from the hand-over folder's findings ledger and `round-<n>/` snapshots (below), then `effort`
    (below; none on a release hand-over), then `late fixes` on a card still to run (below), then `standard`. `✓`
    passed; `!` to look at (a step not run here, with its reason, or not run after a failure; no
    findings ledger, or one holding no row yet: `no findings recorded`; only nits open); `✗` failed (a
    failed step, a blocking or should-fix finding open, no independent review after the last round, `gate
    never run on this tree` when there is no record).
  - `review`: the review rounds are the `round-<n>/` snapshots only, against the cap of the folder's effort
    and risk class (the rounds of the higher of the two, below `lot risk`), then the independent
    review, then the open findings: `✓ review  2 review rounds of 2 · independent review approve · approved`.
    The independent review must come after the last snapshot: an `independent-reviewer` station end with a
    verdict strictly after the snapshot's time (`round-<n>.state`'s `at`, else `round-<n>.base`'s mtime; a
    tie is not after), shown `independent review <verdict>`; or, for a folder without step events (no
    `events.jsonl`, or events saying the worktree's cli writes none), a ledger row of a round above it,
    shown `independent review: round 3 in the ledger` (`rounds 3-4`); or, in a lot's folder or a hand-over folder
    alike, a `lot verify` line strictly after that time (a clean last round leaves no ledger row), shown
    `independent review: verified by <who>`. None: `✗ review  no independent
    review after round <n>`, the card BLOCKED. Beyond the cap each round names its first go-ahead row
    (`3 review rounds (cap 1, round 2 by <who>, round 3 by <who>)`), a round without one gives `! review
    3 review rounds, cap 2, no go-ahead recorded` (a warning); no effort recorded: `2 review rounds (no
    effort recorded)`. A folder with step events and no review round snapshot reads `✗ review  no review
    round snapshot: dialecte lot snapshot <lot> --round 1` (the ledger never stands in there). A folder with
    no snapshot, no ledger row and no independent end, a folder without step events and with no snapshot
    (its ledger rows claim no independent review), and a release hand-over keep the ledger-only line
    (`<n> rounds · approved · findings ledger`).
  - `effort`: the effort against the risk class, from the folder's `risk.jsonl`: `✓ effort  high · risk class
    high at handover write (src/cleanup.ts:2: rmSync) · 2 review rounds of 3` (`risk class unknown` with no
    derived line); an effort below the class `! effort  medium below risk class high (by <who>: <reason>)`, or
    `(no go-ahead recorded)` when no reason is recorded (an effort line without one, or the lot's own effort), a
    warning that never changes the verdict; `no effort recorded` without one.
  - `late fixes`: a change of the tree after the last snapshot (the worktree's state hash against
    `round-<n>.state`'s) reads `! late fixes  unverified since round <n> (<k> files): dialecte lot verify
    <lot> --by <who> --note <text>`, a `lot verify` of the current state `✓ late fixes  verified by <who>:
    <note>`, a last snapshot without `.state` (an older cli) `! late fixes  not checked (round <n> has no
    state)`; the last snapshot's tree, or no snapshot, prints no line. A warning only: `handover run`'s
    `verify` guard refuses. The records read are the worktree's last runs and the store's records of the tree the
    hand-over commits - the worktree's tree, or for a hand-over holding a merge lot the tree its last lot
    leaves (the trial merge with its resolutions) - the newest record of each step winning; a tdd step
    another worktree recorded is left out (its verdict is that worktree's), and a stored record counts
    only when it ran against what is installed here now (the same `node_modules` and `file:`
    dependencies) with the command of its mode now. A line from a record made at a commit outside the
    history of HEAD ends `· from <sha>` (the branch commit's hook record read for a merge on main; a
    record of an earlier commit of this line carries none), a rehearsal's record `· rehearsal`. A record
    of another tree than the one checked ends with `(the tree changed since)`: its line turns `!` and
    blocks the hand-over; a failed step stays `✗`. The `tdd` line is the worktree's: it is stale only when
    its record is of another tree than the worktree's now, never because the tree checked is a merge's;
    once a merge hand-over is committed, its card keeps `! tdd ... (the tree changed since)` and `gates ran
    on another tree: tdd`, since the worktree took the merge after its tdd verdict.
    The `mutation` line is what the package still owes its mutation runs, read from the mutation store when
    the card is written. `✗` (blocks): `new` survivors or died runs of the package, whatever their lot
    (`2 new survivors · 1 died run: dialecte mutants status`); a run of the branch still running when the
    hand-over merges a branch (`run <id> still running (pid <pid>): the merge waits for it`, a run of a
    merged branch too) or when the lot's mutation switch is `gate` (`...: a gate lot waits for it`); a gate
    lot with no run of its branch (or a merged one) reported on the tree the hand-over commits
    (`gate lot: run dialecte mutants run on this tree first`); an invalid `dialecte.mutation` or lot switch,
    with its reason. `!` (does not block): a run of the branch still running on a plain hand-over
    (`...: its survivors are not in yet`). Otherwise `✓ mutation nothing pending`. To unblock: kill each
    survivor with a test, record its reason
    (`dialecte mutants record --key <key> --family <family> --reason <why>`), or
    `dialecte mutants schedule <follow-up> <key>`; rerun a died run or `dialecte mutants abandon <run id>`;
    wait for a running run; run `dialecte mutants run` on the tree for a gate lot. The switch is the
    hand-over folder's `lot.json` when it holds one, else `.dialecte/lot.json`.
    The `standard` line says whether the standard was consulted. A standard is configured when
    `DIALECTE_STANDARD` names a file or folder that exists (the environment only: no committed file names
    it). `✓ standard  consulted · <note>` when one is configured and the station recorded a consultation;
    `✗ standard  configured, not consulted: dialecte lot standard <folder> consulted <note>` (blocks) when
    one is configured and none is recorded; `! standard  not consulted: none configured (DIALECTE_STANDARD)`
    otherwise, with the recorded not-consulted reason when there is one: a warning that never blocks. An `outside` record (the lot's asks answered outside the documents) gives `! standard  answered outside the documents · <note>`, a warning at every effort; at effort high, unless the record's `confirmed` flag is true, it fails: `✗ standard  answered outside the documents at effort high, not every answer confirmed by a person (dialecte ask answer <ask-id>) · <note>`. The flag decides, never the note's text; a record without it reads as not confirmed. A DONE card
    (committed) shows the state recorded on the lot, never one read from the shell that ran the hand-over:
    `✓ standard  consulted · <note>`, `! standard  not consulted · <reason>`,
    `! standard  answered outside the documents · <note>`, or `! standard  not consulted: none recorded on the lot`. The station records it
    with `dialecte lot standard <id|folder> consulted <note>` or `not-consulted <reason>` (the card's line
    names the hand-over's folder).
  - `contrib` (a contributor's): the rows of the `dialecte contrib` record of the tree the hand-over commits,
    read as gate lines (`rules` with its errors and warnings, the package's steps, `release`), then the live
    `mutation` row. A stored record counts when its key is the one the `contrib` guard asks for: a run at
    the lots file's HEAD on that tree, against what is installed now, with the package's contrib rows. Else
    the worktree's last contrib record, each row stale and saying what changed: `(the tree changed since)`,
    `(HEAD moved since: run dialecte contrib again)`, or `(the install or the contrib rows changed since)`;
    else `✗ contrib  never run: dialecte contrib`. Every row green prints one line naming the rows, with the
    record's source; any other row expands the section to one line per row. A failed or stale row counts
    with the failed gates and the gates of another tree.
  - `tdd`: the lot's exemption; only the cases of the change count, those the gate's tdd step listed on
    this tree (a retitled or removed case's receipts are not counted under the old title); without a gate
    record of this tree that lists them, one line `counts from the last gate: run the gate on this tree`
    replaces the counts, groups, entries and flags; each case counted once by the status the gate gave
    it (red then green as proven, kept when its last receipt is a kept after a green; accepted and
    revised only in their groups)
    (`<n> proven red → green · <m> unchanged`, and `· <k> kept` when any); the accepted cases: a head
    line `<n> accepted`, then one row per reason of the lot file (`<count>  <reason>`, the largest group
    first, a tie in the lot file's order, each reason wrapped under itself); the accepted and revised receipts
    of earlier lots (cases outside the change), which the lot file no longer names, on one line
    (`earlier lots: 410 accepted, 12 revised (not in the lot file)`); then
    `<n> revised · <m> gone · <k> unused · <j> skipped` with `to read ↓` at its right edge and one entry each: a revised case `<file> › <title>` (named by the lot file exactly, or by a file or glob entry)
    with its reason under it, a helper a red run froze for a `revised` entry as `revised <helper>` with its
    reason under it, a `gone` entry with its reason (whether one covers a finding is the gate's
    to say), an `accept` or `revised` entry no case used, a case of the change whose receipts the read
    rule skips (`skipped <file> › <title>: 1 accepted receipt (no longer declared)`). Then one line per kind of flag with its count of
    cases (`dialecte tdd status --flags` lists them); cases whose only flag is `test code changed around it`
    and whose receipts are otherwise only unchanged are counted apart (a case flagged rollback or red after
    green never is), as
    `helper code changed near unchanged cases (noise)`.
  - `notes`: the lots file's `gates` text, as written; only on the cards printed before a run (the
    written card, a rehearsal's), never on the card after a real run.

  Its closing rule names the hand-over, so a part of the card copied alone still says which one it is:
  `dialecte handover show <id> · run <id> · --legend · details: dialecte tdd status`, `<id>` the
  hand-over's registered name, or its folder's absolute path when it has no entry (a folder written by an
  earlier cli; in a box too narrow for it, that
  text is printed inside, above a plain closing rule) - on the written card, `show`'s, a run's and a
  rehearsal's. The command stays under the box until every lot is committed. `dialecte handover --legend` prints every term the card can
  print, each in two lines: what it means, and whether to look.

- `dialecte handover run <folder>` (and `--rehearse`) holds the machine awake while it runs, as `gate --full`
  does, and writes `last-run.json` in the hand-over folder when it ends (before the card of a real run):
  `sleptMs` when its wall time passed its monotonic time by over 60 s; the DONE card then prints
  `! slept <duration> during handover run` in its gates.
- A hand-over written behind its target branch is not run. The card (READY or BLOCKED, `handover show <one>`)
  prints `! main moved: merge main first (3 commit(s) on main, now 1a2b3c4d)` under its verdict, which reads
  BLOCKED (`--json`: `targetMoved: { branch, ref, tip, behind }`). The target is held when its tip is an
  ancestor of the lots file's HEAD or of a merge lot's tip. When some lots are committed already the line adds
  `: write a new hand-over on the current HEAD with a merge lot of main`. A hand-over onto the target itself, a
  committed one and an abandoned one are not judged; a lots file written before `target` existed is judged
  against the base branch; a `target` that names no ref gives a `!` line with the refusal and BLOCKED.
- The card also lists the processes working in the worktree (`handover show <one>`, READY or BLOCKED; `lot
  result`, the run picker and `handover list` never look): `✗ processes  2 left running in the worktree: 4123 node
  …vitest --watch, 4177 npm run dev  (stop them: kill 4123 4177)` blocks, `! processes  open on the worktree:
  code, zsh` and `! processes  not known (<why>)` warn (`--json`: `processes: { leftBehind, tools, unknown? }`).
  The run itself, its shell or agent, what it started and every process of its own process group (the other
  commands of its pipeline, such as a `| grep` after it) are never listed: a leftover started in the same process
  group as the cli (the same non-interactive shell command) therefore counts as the run's own. A process with a terminal, one
  whose command (or an ancestor's) is a known editor or the one `git config dialecte.editor` names, and one
  named in `git config dialecte.personProcesses` (a comma list of command names, never committed) is one of the
  person's tools; every other process is left behind.
- `dialecte handover run <folder>` is what `commit.sh` runs. Three of its guards, `target` (the target branch's tip is held, as above),
  `processes` (read at run time, never from the card: a process left behind, or a list that cannot be read,
  refuses; tools only pass with `!`) and `verify` (late fixes nobody verified: `✗ verify  late fixes
  unverified since round <n>`; `! verify  late fixes not checked (round <n> has no state)` never refuses;
  `✓ verify  no late fixes`, or `verified by <who>: <note>`), come after the merges guard. Each refusal
  exits 2 with nothing committed, where every other guard exits 1; `--rehearse` prints `!` for each and goes
  on. The merges guard's note for a merge lot of the target that moved reads `lot <n>: merges main at <sha>; main
  is now <sha> (see target)`. The install guard runs at each lot instead, once its files are staged (after the
  lock sync below): `node_modules` read against the lock the commit holds, the index's `package-lock.json`. A
  package at another version, missing or a link elsewhere, a lock that cannot be read or a check that cannot be
  made refuses the lot (`✗ lot <n> not committed: node_modules do not match package-lock.json: run npm ci in
  <worktree>`, the packages under it; when the working lock is a later lot's, `... the package-lock.json lot <n>
  commits (a later lot changes it): run npm ci with that lock, or commit the lock change first`) with exit 2, under `--rehearse` too: no `!` there, a rehearsal checks its
  clone's `node_modules`. No lock in the index: nothing checked. Each check replaces `install.json` in the
  hand-over folder (`{ at, lock, working, ok, mismatched }`, `laterLock: true` for a later-lot refusal); the card shows it as its `install` line (`✓ install
  node_modules match package-lock.json (<hash>)`, or `✗` with the count, which blocks a card still to run) while
  the worktree's `package-lock.json` is the one the check saw (`working`), else no line. Each guard prints one line with its result
  and its time (`✓ snapshot    110 file(s)  0.4 s`): repository, the lots file as reviewed, hooks
  folder, branch, HEAD, empty index, the files against the snapshot, deleted files, files outside the
  lots, references (citations, declared patterns, and the tags of a contributor), `contrib` in a contributor
  (a green `dialecte contrib` record of the tree the lots leave, at the lots file's HEAD, against what is
  installed now; a rehearsal never stops there), and last `mutation`: the card's `mutation` verdict computed again when the
  guard runs (never taken from the card), so a run that reported a survivor, or died, after the card was
  written refuses the run with exit 1 and nothing committed (`✗ mutation <detail>`, each survivor and died
  run indented under it, then what to do with each); a run still running on a plain hand-over passes with
  its warning; `✓ mutation no mutation scope declared` for a package without one. A rehearsal runs the
  same guard. When the staged files are exactly the next lot's (a run stopped after
  staging it), the index guard prints the command that unstages them, with its `cd`.
  Then each lot announced before its work: off a terminal `▶ lot n/N` with its files and subject, and a
  line every 30 s in which nothing of the lot was shown (`… <lot> running 2 m 10 s`: hook lines the view
  leaves out do not count); on a terminal one spinner line naming the lot,
  what runs and the time. The commit's hook output is read as steps, from npm's script headers: a script
  that runs others (`npm run`, `run-p`, `run-s`, `npm-run-all`) is their parent, and the lines of the
  scripts a parent runs in parallel stay the parent's. While the hook runs, only the current step and the
  warning and error lines show (lint, format, type-check and build warnings and errors, failing tests),
  each labelled by the step that printed it (`[lint:check] <line>`): on a terminal the step with its
  elapsed time and those lines live under the spinner, off one `│ ▶ <step>` per step and those lines
  behind `│`. A test step (a `test` segment in its name: `test`, `test:run`, `unit:test`; or a test
  runner on its command line: `vitest`, `jest`, `node --test`) shows its failing tests and failed scripts
  only: the warnings its tests print are theirs, not the repository's. A line its step printed already
  (the same text: Vite's `configLoader` notice, 2-3 times per build) is not a new line: on a terminal
  the first one carries the count, `<line> (×3)`, updated in place; off a terminal (a log) a line is
  written as it is read, its identical repeats right after it are counted, and when that run of repeats
  ends (another warning or error line, the next step, the hook's end) a run of two or more is written
  again as `<line> (×<n>)`. Lines of different steps never merge. Every byte goes to the hook's full
  log as it comes. After a passing hook, one summary line
  (`check ✓ · test:run ✓ 1214 · build ✓ · 1 lint warning in lint:check`: the scripts the hook runs, a
  script they run only when it printed counts or failed; the warnings counted per step and kind, in the
  order first printed, each distinct line once: the same text printed again in its step counts once),
  the labelled warning lines (each once, where it was first printed, with its step's total as
  `(×<n>)` from 2) and `full log: <path>`; after a failing hook, the
  summary with `✗`, the labelled error lines not among the failing step's last 30 lines (each once, with
  its count), those 30 lines
  and the log's path. Under it, when the hook is `gate --hook`, one landing line
  `hook: reused <step> (<mode> <time>), ... · ran <steps>` (`none` for an empty list) says what the commit's hook
  answered from records and what it ran, read from the lines `gate --hook` printed before its failed tail marker
  (`--- last lines of <step> ---`): a line of the relayed tail shaped like a reuse or a step line is the failed
  step's output, in neither list. A hook that ended (passed or failed; not one stopped as stalled) is recorded in
  the git folder of the repository it committed in (`dialecte-gate-hook.json`, mode `hook`): HEAD after
  it (the new commit, or the base when it failed), the state hash of the tree before the commit and the
  steps its summary names with their status and counts; the card reads it with the gate records, so a
  lot committed where no `dialecte gate` ran still shows its gates, until a newer gate record replaces
  it. The record holds its key too (the tree the hook ran on, what npm installed, the `file:` dependencies,
  and for `commandHash` the hook files git runs: husky's `.husky/<hook>` scripts, else the hooks folder's
  executable files) and goes to the repository's store of records by tree. A rehearsal writes it in its
  scratch clone's git folder and in the repository's store, marked `origin: "rehearsal"`, never in the
  repository's own `dialecte-gate-hook.json`. A hook that prints nothing gets `hook ✓` (or
  `hook ✗`) and the log's path; a repository with no commit hook prints none of it (in husky's `.husky/_`,
  which holds a wrapper for every hook name, a hook counts only when its script exists in `.husky/`). Then the commit with
  its stat; the total time and the card at the end. A lot whose `git add` or commit fails is unstaged again: once the cause is fixed, the same command
  finds the lots already committed on top of the recorded HEAD (same message, same paths, the bytes of the
  reviewed snapshot `files.sha256`, not the working tree) and resumes at the next one; anything else on top
  of HEAD is refused with what was found. When every lot is committed, the `head` line says the hand-over is
  already committed and the guards after it (they read the working tree, which later work may change) are
  not run: the run exits 0. It never
  pushes. `--rehearse` first decides, per lot and before any clone, whether rehearsing it can find
  something new, and prints one line per lot: `lot <n>/<N>  reused  <reason>` or
  `lot <n>/<N>  rehearse  <reason>`. A plain lot is reused when the store holds a green `gate --full` of
  the tree its commit will hold (HEAD with every lot up to it on top) with the key of now - the same
  `node_modules`, `file:` dependencies and the `--full` steps that tree's package.json holds - the lot does
  not change `package-lock.json`, and the commit hook that tree holds stages no files of its own (its text
  names `git add`, `git stage`, `lint-staged` or `git update-index`): `green gate --full on tree <tree>`.
  Each lot is judged with its own tree's hook files and gate lists, a merge lot with the merged tree's: the
  commit runs the hook its tree holds, whatever the worktree's is now. A merge lot is reused when the tree it
  leaves (its trial merge with its resolutions) is its tip's tree and a green record of that tree - the branch
  commit's hook record or a `gate --full`, with the key of now - is in the store, under the same
  conditions: `green hook record of the tip's tree <tree>`. Otherwise the line says the first reason that
  holds: `no green gate --full on tree <tree>`, `the lot changes package-lock.json`,
  `the hook stages files (<match>)`, `node_modules changed since the record`,
  `a linked dependency changed since the record`,
  `<branch> moved: the merge leaves tree <tree>, the tip holds <tree>` (`<branch>` the one the hand-over
  commits on: `main moved: ...`), `no green record of the tip's tree <tree>`; `--rehearse --full`
  rehearses every lot (`--full`). The decisions go to `rehearsal.json` in the hand-over folder
  (when, and per lot its tree, `reused` or `rehearsed`, the reason and the record reused: mode, time,
  HEAD, and `contrib: "run"` on a contributor's last lot whose tree has no green contrib record). When every
  lot is reused and no contrib run is needed, no clone is made: the guards, a reused merge's `tree <sha>`,
  then `rehearsal skipped: every lot's tree has a green record` and the card. Otherwise the clone is made
  (`▶ rehearsal contrib` then runs `dialecte contrib` in it at the lots file's HEAD on the tree the lots
  leave, before any commit, its rules row judged against the last merge lot's tip (only the last one: the lines
  an earlier merge of another branch brought in count as added), so only the lines the lots add can fail it;
  without a merge lot against the base the repository resolves at the lots file's HEAD, as `dialecte contrib`
  there would, never the clone's own base branch; its record going to the repository's store as a rehearsal's; the clone is put
  back after it, the files the run left removed) and
  the reused lots are committed in it with `--no-verify` (their hook skipped, in the clone only), the
  others with their hook, handed `DIALECTE_CHECK_STORE` (the repository's git common dir): a `gate --hook` in
  the clone reads the repository's records and writes its own there, marked as a rehearsal's. Each lot is
  committed on its own tree: before it is staged, the files of every later lot go back to what the clone's index
  holds (HEAD's content: a later lot's new file absent, a file it deletes present), so the commit and its hook see
  HEAD plus the lots up to that one, and a lot that needs a later lot fails its rehearsal alone; once it is
  committed, those files come back from your working tree as it is then (an edit made during the rehearsal reaches
  the clone's later lots). A rehearsal that stops brings every lot's files back before its card, which sizes the
  lots not committed from them. A real run (no
  `--rehearse`) runs every commit's hook, whatever the store holds; a `gate --hook` there answers each step from
  the rehearsal's records (or a gate's) of the same tree and install, so the commits take seconds when nothing
  changed.
  The rehearsal clone (`▶ rehearsal clone`) warns naming the untracked files outside
  `.gitignore` and `.git/info/exclude` a hook could read (they are not in the clone), and runs the lots in a scratch clone that looks like your tree - the repository at
  HEAD, your working tree on top, the hooks folder, its `node_modules` got as `worktree add` gets it - so the hooks
  run as they will for real. The clone sits in a rehearsal folder under the cli's scratch root
  (`DIALECTE_SCRATCH`, else the workspace's `.worktrees/_scratch`, else `dialecte-scratch` in the system's
  temporary folder): `<scratch root>/dialecte-rehearse-<random>/<repository folder name>`, on the volume of the
  worktrees, so its trash and its `node_modules` move by rename. The hook runs with `TMPDIR` set to a short folder of
  its own, `/tmp/dlt-hook-<random>` on macOS and Linux (the rehearsal folder's `.tmp` on Windows), so a tool's socket
  under it stays within the system's path limit; it holds sockets and small files only and goes when the rehearsal
  ends. Beside the clone, a link per relative `file:` / `link:` dependency of the
  repository's package.json that leaves the repository, to the folder the same path reaches from the
  repository (`file:../core`: `<rehearsal folder>/core` -> the repository's `../core`), so the clone
  resolves it as the checkout does; one line names the links, and a path that leaves the rehearsal
  folder too, or whose target is missing, is not linked (a line says why). In a workspace (the
  repository's parent holds `.worktrees/`) the clone stays fresh but its `node_modules` is taken from the
  pool when an entry matches its lockfile (`node_modules: pooled _pool-<repository>-<n>`), parked back at
  the end, and the rehearsal folder goes to `.worktrees/_trash/`, removed in the background (removed here
  when the trash is on another file system). Elsewhere the whole rehearsal folder is
  removed at the end - its links unlinked, never what they reach - (`--keep` keeps it and names it:
  `kept the rehearsal folder: <path>`), and on Ctrl-C or SIGTERM, with the hook and every process it
  started stopped. The clone's git folder holds a marker naming the process that made it
  (`dialecte-rehearsal.json`). A real run marks its hand-over folder with `running.json` (its pid and
  start time) while it runs, removed at its end, on a failure, and on Ctrl-C, SIGTERM or SIGHUP received
  while a commit (its hook) or an install runs; a run stopped at another moment leaves it, and a marker whose
  process is gone counts as no run.
- A lot of `lots.json` can be a merge (git 2.38 or later, for its trial merge):
  `{ "kind": "merge", "branch": "<branch or tag>", "tip": "<sha>", "resolved": { "<path>": "<file>" | null }, "message": "...", "tree": "<sha>" }`
  (`null`: the merge removes the file). Merge lots are trial-merged in sequence: each on the tree the lots
  before it leave - HEAD's, each earlier plain lot's files as they are in the working tree, each earlier
  merge's trial tree with its resolutions - so a conflict that appears only on top of an earlier merge is
  found at the write and needs a resolution, instead of stopping the run. The write refuses a branch that
  is gone or moved since its tip was reviewed, a missing resolution file, a resolution holding conflict
  markers, a conflict of the trial merge without a resolution or on a symlink or a submodule, and a file
  the merge changes that has working-tree changes outside the resolutions (a file an earlier lot commits
  aside). It records the conflicts, each resolution's hash and the tree the merge was trial-merged on
  (`onTree`) in `merges.json`, under the review hash like `lots.json` (`--rehash` after a review). A resolution may
  cover a file that merges cleanly (the lot changes it on top of the merge). Rehearse first:
  `--rehearse` prints the merge's `tree <sha>` (a reused merge too), which goes into the lot as `tree`;
  a real run requires it ("tree not recorded: rehearse first"). Before merging, the run refuses the lot
  when HEAD's tree is not its `onTree` - an earlier lot committed other content (a hook staged files of
  its own) - naming both trees, with nothing merged, and the next step (see what the lots before it
  committed, then write the hand-over again from this HEAD for the lots left). A `merges.json` without
  `onTree` (written by an earlier cli) is refused at the read: write the hand-over again, then
  `--rehash` after a review. The run merges the recorded tip (`git merge --no-ff --no-commit`; a branch
  moved since is a note) and refuses a merge in progress, leaving it - except one of the lot's own tip
  that this cli started (its marker in the git folder) or with `--resume-merge`, aborted and redone. It
  checks the conflicts against the recorded ones, copies the resolutions (hash-checked), refuses
  conflict markers in the result, and checks the staged tree against the recorded one before the commit
  (else the merge is aborted) and the commit's tree after it (a hook may stage files). A merge whose
  hook refuses it is aborted, for a clean rerun. A rerun recognises a done merge by its subject, the
  tip as its second parent and its tree. Before any commit whose staged `package-lock.json` differs
  from HEAD's, `node_modules` are brought to it: the staged lock and `package.json` written over the
  working copies (the working ones saved first in the git folder's `dialecte-install-backup`, put back
  after the install, on an interrupt too; a backup a crash left is restored by the next run when the
  files still hold the staged bytes, else refused naming it),
  `npm ci --ignore-scripts --prefer-offline --no-audit --no-fund` (no install script runs: a `prepare`
  or `postinstall` could change git config, hooks or any file; `npm ci` reinstalls every package, so
  the note after the sync names each installed package of the staged lock that has one,
  `install scripts not run: <names>`: each package once by its name, a nested copy too, five named then
  `and <n> more`), the working copies put back byte for byte;
  refused when the install changed the staged files or the versions still differ (the sync leaves absent dev,
  peer and optional packages aside; the install guard right after it checks dev and peer ones, and refuses the
  lot when one is missing). A real run that leaves every lot committed, and committed lots itself, then moves every lot
  file of the worktree into the hand-over folder, after the card is built: the root's `.dialecte/lot.json`
  as `lot.json`, each tracked package's (the folder of a tracked `package.json`) as
  `lots/<package path>/lot.json`. Each leaves an empty declaration (`{}`) in its place, saying so in one
  line (`lot file archived: <archive>`): the next lot on the branch does not inherit its entries. An
  archive already holding the same bytes is kept and the file emptied; one holding other bytes gets
  `lot.landed.json` beside it, never written over; when both hold other bytes the file is left as it is,
  naming both. Each archive is read back after it is written; one that cannot be written or read back
  leaves its lot file as it is, named with why (`lot file not archived: <file> (<why>)`), and the folder
  records those bytes in `lot-archive.pending.json`; the other lot files are still archived. A package
  the lots deleted (its `package.json` gone since the hand-over's HEAD) still counts. An empty lot file, a
  rehearsal and a stopped run leave the lot files as they are. So does a run that committed nothing, such
  as a done hand-over run again: each non-empty lot file is named (`lot file left as it is: <file>`),
  since it may already hold the next step's entries; only bytes the pending record names are archived.
- `dialecte handover show [<name|folder>] [--json]` prints a hand-over's card again, recomputed from its
  folder (the lots file, the snapshot) and the records - the lots found committed from the lots file's HEAD
  to the tip of its branch, `DONE` when every lot is - and writes nothing: not in the folder, the store,
  the worktree or its index, nor a lock or a run marker. A word without a path separator that names an
  entry of the store is that entry's folder; else a number (`0171`, or unpadded `171`) names the newest
  entry of the worktree of that index (ranked by name as below, never by when it was written) - `run` and
  `abandon` take it the same way; anything else is a path (relative to the current folder: `./0171` is a
  folder), and
  a registered folder given by its path still gets its name on the card. Without an argument: the newest
  registered hand-over of the current branch (the latest date, then the highest counter, from the name),
  whatever its state; none for the branch: the store's entries, one `name  branch  state` line each, exit
  1 (an empty or missing store says so, exit 1). While the folder exists its state is the folder's own
  (abandoned, pending, partly committed, committed, stale); a folder removed is `gone`: listed, never run,
  never shown as a card (exit 1, naming the missing folder). After the box, when a file of a lot not yet committed
  (or `lots.json`) differs from what was reviewed, a deleted one included:
  `<n> file(s) differ from the reviewed snapshot: re-gate, then dialecte handover <folder>/lots.json --rehash`;
  then the run command on its own line, none once done or abandoned. Colour and width as the written
  card. An unknown name, or a folder that is no hand-over: exit 2, naming it. `--json` answers the card
  as data with its `folder` and `name`, as `dialecte handover --json` does, and `changedSinceReview` (the
  count of that line).
- `dialecte handover review <name|index|folder> [--json] [--print]` opens the hand-over's worktree (the lots
  file's `repository`) in one new editor window and returns at once: the editor is started detached, its output
  ignored, never waited for. The hand-over is named as `show` names it. For a hand-over holding a merge lot it
  first writes `<hand-over folder>/review/lot.diff`, the lot's own change against the lots file's `head` (what is
  committed on top of it, staged, unstaged, and the untracked files git would add; ignored files left out; no
  colour whatever the git config), read through a scratch index so the repository is left as it was, and opens it
  in the same window. The editor: the worktree's `git config dialecte.editor` when set (its words, split as a
  shell splits them, then the paths; no flag added), else the first editor of a fixed list the cli knows found as
  an executable file on `PATH` (searched by the cli, no shell; opened with its new-window flag), else
  `code --new-window`; `$EDITOR` and `$VISUAL` are never read. `--print` prints the command line it would run (each word that needs it shell-quoted, so
  it runs as copied) and starts nothing; with `--json` too it prints that answer and starts nothing; `--json` answers `{ editor, command, opened }`. Exit 2: no
  argument, an unknown hand-over, a worktree that is gone (naming it), or an editor that is no executable file
  (`editor <word> not found: set git config dialecte.editor`), nothing started; with `--json` a refusal answers
  `{ error }`, the message as written. Every READY card gets a `review`
  section after the gates, `dialecte handover review <name>  (opens <editor>)` (`review: { command, editor }` in
  `--json`), read from `PATH` when the card is built; BLOCKED, DONE and ABANDONED cards have none.
- `dialecte handover run` without a folder runs the one registered hand-over still to run (its folder
  pending or partly committed; `--rehearse` too): an abandoned, committed, stale or gone one is skipped.
  Two or more: refused, nothing run and no run marker, one `name  branch  verdict` line each (`READY` or
  `BLOCKED`, computed as `show` does), exit 2; none: says so, exit 1. `handover run <name>` runs that
  registered hand-over (a gone one: exit 2, naming its folder). A hand-over in the folder of a `canceled` lot
  is not run, however it is named (exit 2 before any guard, naming the lot, nothing written).
- `dialecte handover abandon [<name|folder>]` gives up a hand-over that will not run: it writes
  `abandoned.json` (when) in its folder, records its entry `abandoned`, then removes the lock of its worktree when the lock names this
  folder's `commit.sh` (a lock naming another hand-over is left, said in one line). Without an argument:
  the hand-over the current worktree's lock names; no lock: says nothing is held, exit 1. Refused (exit 2,
  nothing written) while a real run of it is in progress, and once every lot is committed; a partly
  committed one may be abandoned, its commits stay. A lot folder is refused too (exit 2, nothing written):
  `<full name> is a lot: its hand-over is redone with dialecte handover write --rehash --out <full name>; to
  end the lot: dialecte lot stop <full name>`. It never touches the index, a ref or a commit. An
  abandoned hand-over is `abandoned` in `list` and `show`'s listing, `ABANDONED` on its card (no run
  command); `run` without a folder skips it, `run <it>` refuses (exit 2, naming the marker); abandoning it
  again says it already is (exit 0), and `dialecte handover <lots.json> --rehash` of its folder is refused
  (exit 2, nothing written, naming `abandoned.json`): write a new hand-over into a new folder instead. A run
  and an abandon started at the same moment never both go on: each reads the other's marker again after
  writing its own, and one that finds it refuses (exit 2), nothing committed or abandoned.
- `dialecte handover list [--root <dir>] [--json]` lists every hand-over folder under the workspace's
  `_commit-plan/` (or the folder given, or the current one): repository, worktree, branch, lots, age, and
  its state - pending, partly committed, committed, abandoned, or stale when something else moved the branch. A
  folder holding a hand-written `commit*.sh` and no lots file shows as "legacy script, state unknown".

`handover write` into a store lot's folder first holds the lot to its design: while it needs a design that is missing,
not approved or stale, the write is refused and nothing is written; the card's `design` line fails, so `handover run`
refuses too.
