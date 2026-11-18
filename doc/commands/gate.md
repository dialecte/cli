# dialecte gate

<!-- dialecte-reference: generated from the command map by npm run doc:generate; edit the map, not this block -->

The package's Definition of Done with the real counts

```text
gate - The package's Definition of Done with the real counts

  dialecte gate [--fast | --full] [--base <ref>] [--no-reuse] [--declare <path>]... [--json]
  dialecte gate --hook [--no-reuse]
  dialecte gate --release [--base <ref>] [--no-reuse] [--json]

  steps from package.json "dialecte": { "gate", "generatedDocs" } or the defaults; --full then runs
    npm run type-narrowing when the package has that script and no step runs it (a skip line when it
    lacks it); refuses while a hand-over script holds the repository
  --fast - the default; starts with the worktree's hygiene (nothing staged, no stash on its branch,
           new files declared)
  in a lot's own worktree, --fast and --full end with the lot's conflict forecast against main and
    every open lot (as lot forecast, recorded with trigger gate): forecast: <verdict>, then one !
    <against>: <why> line per comparison it does not clear, said before the notes and the verdict;
    --json adds forecast { verdict, lines }; a warning only, the gate's verdict and exit never
    change; none in a review throwaway, none for --release
  a failing vitest test step is rerun once, serially, on its failing files: passing there it is
    flagged flaky in parallel
  the default lists end with a scoped rules step (dialecte rules); a step whose run starts with the
    word dialecte runs as the gate's own cli (its node and entry file, never node_modules/.bin), its
    line ending (dialecte <version>); a missing dialecte bin fails that step, never the gate
  a green record of the same tree, install and steps answers the steps after a fresh tdd step;
    --no-reuse runs them
  --full and --release hold the machine awake while they run (macOS: caffeinate -i -w <pid>;
    DIALECTE_KEEP_AWAKE=0 turns it off); a run that spanned a sleep keeps sleptMs on its record and
    the card says it
  --hook - in a commit hook, no test suite (CI runs it on every push): with "dialecte.gate.hook"
           declared, the tdd receipts of the lot first (every new or changed case since the lot base
           proven red then green, unchanged, accepted or revised, its newest green at the production
           as committed; a stale green names dialecte tdd green (measured from the lot base); a
           first or merge commit skips it), then the declared steps (the cli: check, then rules on
           the touched files); without one, the steps of --full but the scoped ones that count no
           tests; each step answered by a green record (any mode) of the committed tree and install
           that ran it as it is now, else run; the running line names the steps it runs
  --release - alone: "dialecte.gate.release" (default: the --full steps), every scoped step against
              the empty tree (--base feeds only the tdd step); records dialecte-gate-release.json;
              each of its steps answers a hook step of the same step hash (a scoped one at any base:
              it checked everything); its green record answers a rehearsal, contrib and the card
              when the list covers full (same name, run, counts and changedOnly for every full step)
  scoped steps ("scoped": true) get DIALECTE_GATE_BASE, _TREE, _CHANGED (the changed paths byte for
    byte, NUL-separated, relative to the repository top as git diff --name-only names them; a
    declared failing path is relative to the package root) and _SELECTION, where they write {
    schema: 1, base, tree, changed, selected: [{ id, reasons }], skipped: [{ id, reason }] } (both
    lists required, reasons non-empty); the base is --base <ref>, else the merge-base with the base
    branch (the first found: "dialecte.baseBranch", origin/HEAD, main, master; each local, else on
    origin), else the empty tree; a local base branch holding commits origin's lacks: a note naming
    the count, the base read from origin's; select from the working files; without the gate (no
    DIALECTE_GATE_SELECTION): select everything
  a step whose run is npm run <script> the package lacks is not wired: a default step fails a --full
    or --release run (a --fast one says it and goes on), a declared step fails in every mode; then
    no step runs, the others read not run: a step of the list is not wired; "dialecte": { "gate": {
    "skip": { "<default step>": "<reason>" } } } (dialecte.gate.skip) opts a default step out, a
    warning with its reason
  a scoped step: an empty selection exits 0 without starting vitest (nothing selected since <base>
    (<n> paths changed)); a non-empty one on a counts: "tests" step that runs no test fails; a
    failed scoped step counting tests is rerun once serially on a test failure (a failed test, a
    FAIL line, vitest's error markers), whatever runs it: the failing files (after -- through npm
    run), then --no-file-parallelism, and it must select the same ids (one vitest invocation, or
    --passWithNoTests on each); the selection may declare "failing": [paths relative to the package]
    the record keeps with the ones the output names; "heavy": true marks a heavy suite, outside the
    command hash

exit codes:
  2  an option the usage lines do not name, or --base / --declare given last without its value: the usage printed (--json: { error, usage, next: null }); no step run
e.g. dialecte gate --full
```

Flags: `--fast`, `--full`, `--base`, `--no-reuse`, `--declare`, `--json`, `--hook`, `--release`
<!-- /dialecte-reference -->

- `dialecte gate [--fast | --full] [--base <ref>] [--no-reuse] [--declare <path>]... [--json]` runs the Definition of Done: `--fast` (default) `check`,
  `skills:check` and the tests of the changed files; `--full` adds `build` and the whole suite (the
  runner's defaults: every file in parallel); both default lists end with a scoped `rules` step
  (`dialecte rules` on the changed files, judged against the gate base); a step whose command starts with the word
  `dialecte` runs as the cli that runs the gate (its own node and entry file, never the package's
  `node_modules/.bin/dialecte`, so a package without the cli installed runs it too), its line ending
  `(dialecte <version>)`; then the steps derived from the package's scripts after its
  own (declared or default): `type-narrowing` (`npm run type-narrowing`, a check a publish workflow runs)
  when the package has that script and no step runs it; without the script, one line
  `skip  type-narrowing  no npm script "type-narrowing"` and no step of the record. The docs build and the type bench are contributor checks:
  `dialecte contrib` runs them (see [Profiles](../../README.md#profiles)). Each step runs unfiltered, with
  `GIT_OPTIONAL_LOCKS=0` (a `git status` inside it never takes the index lock), and is judged on its exit
  code and on the counts it printed: a step exiting non-zero fails whatever it says, a test step that
  counts no test fails - except `--fast` on a change that touches no test (a doc edit): the changed-tests
  step passes with the note "no test file is affected by the change". A step running an npm script the package lacks
  is _not wired_, judged for the whole list before any step runs (every wiring problem shows at once, and a
  failed one leaves every other step unrun): a step of the default list (the package declares no list for the
  mode) fails `gate --full` and `--release` (`FAIL  skills  not wired (no npm script "skills:check")`, then the
  line `add the script, or opt out with dialecte.gate.skip: "dialecte": { "gate": { "skip": { "skills": "<reason>" } } }` under it;
  `dialecte contrib` names `"contrib"` there) and is skipped by `--fast` (`skip  skills  not wired (...)`, the gate stays green); a step the package declares
  fails in every mode, `--fast` included (`declared but not wired (no npm script "<x>")`). The fix is the
  script, the step removed from the list, or, for a default step, an opt-out with a reason (below). The
  hand-over card shows `✗ <step>  not wired (no npm script; or dialecte.gate.skip)` for a full or release record
  (`dialecte.contrib.skip` for a contrib one) and `! <step>  not
  wired (no npm script)` for a fast one, and `! <step>  opted out: <reason>` for an opt-out (a warning). The
  `type-narrowing` step is derived from the package's scripts and is never unwired. A repository without
  package.json has no default list: the gate infers its steps from its files (`pyproject.toml` + `uv.lock` at
  the root: a `tests` step `uv run pytest` for fast and full, counted from pytest's summary line), and a root
  `dialecte.json` (`{ "schema": 1, "gate": { "fast": [...], "full": [...] } }`, the keys of package.json's
  `dialecte.gate` without `skip`) overrides it list by list (its refusals name the lists as package.json's
  `dialecte.gate.<list>`); with neither, the gate refuses naming both. A repository with a
  package.json never reads `dialecte.json`. A gate record written
  before this check is not reused for a package with an unwired or opted-out step (the key changes). While a hand-over
  holds the repository (`dialecte handover <lots.json>` wrote its lock), the gate runs only under the
  hand-over written for this repository - the script the lock names exists and the `lots.json` beside it
  names this repository, real paths compared - and says so in one line with the command that refreshes
  the hand-over once the gate is green (`dialecte handover write '<folder>/lots.json' --out <folder> --rehash`:
  the hand-over folder's own lots file, shell-quoted, and the folder as one shell word, both by their real paths, so
  the command works as printed from any folder of the repository): an author re-gates after a late edit without
  touching the lock. It refuses under a hand-over of another repository, a
  script that is gone, a folder without a lots file, and while a real `handover run` of that folder is
  in progress (its `running.json` names a live process; that refusal names the marker file, in the
  hand-over folder, so a person can tell a pid reused by another process). A refusal names the script and the lock and
  says what to do: run the hand-over first (its last commit releases the lock), or hand the lock's path
  to the person who runs the repository, who decides. A run that reaches its steps records its result in the
  worktree's git folder, `dialecte-gate-fast.json` or `dialecte-gate-full.json`: when it ran, HEAD, the
  state hash and each step (the tdd step first) with its status, its counts and its note or reason, the
  tdd step with the cases of the change it judged (`cases`: label and status); a run refused at the hygiene records nothing. The state hash is that of the tree the
  worktree would commit (HEAD's tree with the changed and untracked files on top, the deleted ones
  removed, `.dialecte/` left out): committing the lots leaves it the same, any other edit changes it.
  The record also holds its `key`, what the run checked: `tree` (the git tree id the state hash is the
  sha256 of), `lockHash` (sha256 of the `packages` of the checked tree's `package-lock.json`, keys sorted and the
  package's own entry left out; `none` when the tree holds none: `node_modules` installing that lock is checked
  before any step, never part of the key), `commandHash` (sha256 of the steps' names and commands in order, and HEAD's commit when a step
  runs only the tests the change affects, which depend on the diff against HEAD; `--base` is no part of
  it: it reads the `tdd` step only) and `linked` (sha256 over the package's `file:` dependencies as node
  loads them - the folder `node_modules/<name>` links to, else the path package.json names - each file
  they publish, their package.json and the paths of its `files`, with its path, size and modification
  time; an exclusion (`!…`) is left out and a glob is walked from the folder before its wildcard, a
  superset of what npm packs; a dependency without package.json or `files` is taken whole;
  `node_modules` and `.git` are always left out). The key is taken before the steps and again after
  them: when they differ (a step edited a file, an install or a rebuilt dependency during the run) the
  record is written without a key, with the state hash of the tree the steps started on, and not stored;
  the gate says so in one line before its verdict (`"stored": false` with `--json`). A run whose steps
  ran is also stored by its tree in the repository's common git folder, `dialecte-checks/<tree>.json`
  (`git rev-parse --git-common-dir`), which every worktree of the repository reads (the newest record
  kept per mode and key). A writer takes the tree's lock first, `<tree>.json.lock` (its pid and its start time,
  written beside it and linked into place, so the lock is never seen empty), reads the file again under it and
  merges its record in, so two writers of one tree lose no record within the wait; a lock whose pid is gone, or
  alive with another start time (a reused pid), is stale and taken over; a live holder, or an empty lock, is waited
  for up to 5 s, then the write goes ahead without the lock (re-read, merged, the holder's lock left alone).
  Before its steps, a gate looks there: a green record of the same mode and the
  same key answers instead of running them -
  `reused: gate --<mode> green on this tree at <time> (HEAD <sha>)`, the record's step lines, then
  `gate --<mode>: green (reused)` (`"reused": true` with `--json`) - and the worktree's record is
  written marked `reused` with the time and HEAD of the run it reuses. The hygiene and the `tdd` step
  run every time: they are about the worktree (what is staged, the receipts, `.dialecte/lot.json`, the
  base), not the tree, and a `tdd` step failing now is a failed gate. A record that failed, that ran no
  step, of another mode (`--fast` never answers `--full` nor the reverse) or written by an older cli
  (no key) is never reused; a stored entry of another shape is ignored. A test step that passed only on its
  serial rerun is green: it is reused with its `flaky in parallel` note. `--no-reuse` runs the steps
  whatever the store holds. The key leaves out the Node version and the environment (a path given
  through an environment variable); a `file:` dependency edited and restored to the same size within
  the same modification time is not seen either. `--full` and `--release` hold the machine awake while they
  run (on macOS a `caffeinate -i -w <the cli's pid>` started at their start, detached, ending with the cli;
  nothing on another system, nor when `caffeinate` is not on `PATH`, nor with `DIALECTE_KEEP_AWAKE=0`), and
  measure their wall and monotonic time: a run whose wall time passed its monotonic time by over 60 s spanned
  a sleep of the machine all the same, its record keeps `sleptMs`, and the hand-over card's gates print
  `! slept <duration> during gate --full` for a record of the tree it checks.
- `dialecte gate --hook [--no-reuse]` runs in a commit hook: when the package declares `dialecte.gate.hook` (a package
  whose full suite runs on CI on every push), the tdd receipts of the lot first - every new or changed case since the
  lot base proven red then green (or unchanged, accepted, revised), its newest green taken at the production as
  committed, the working files the commit for every test or production path - then the declared steps; no test suite.
  A stale green fails naming the cases and `dialecte tdd green` (it measures from the lot base, as the hook does), files left out of the commit fail
  naming them, a first commit and a merge commit skip the tdd step with their reason, and a failed tdd step runs no
  declared step. The cli declares `check` and its scoped `rules`. Without a declared list: the steps of `--full` but
  the scoped ones that count no tests (for the default list: check, skills, build, tests; a scoped `rules` step stays
  the gate's and contrib's), with no tdd step.
  Each step is answered by any green record that ran it as it is now - a `gate --fast`, `--full`, `--release` or an
  earlier hook's - of the committed tree, what npm installed (the version-blind install key: the installed
  packages, not the package's own name and version) and the `file:` dependencies; the tree is the one of the index
  git hands the hook (`GIT_INDEX_FILE`, else the worktree's index), never the working files: a merge commit and a
  partial commit check what they record. Every recorded step holds its own step hash (name, command, scoped and
  wiring marks; the gate base only for a scoped step; HEAD for a `changedOnly` step), so a full gate's unscoped
  steps answer the hook at any base; a scoped step is answered by a record of the same base, or by one that checked
  everything (a `--release` run, recorded at the empty tree). An answered step prints one line, `gate --hook: reused
  <step> from <mode> <time> (HEAD <sha>)`, naming the run that really ran it, and does not run; the others run in
  one go, after `gate --hook: no green record of tree <tree> with this install answers a hook step: running <steps>`
  (rerun serially on a failure, as the gate does), then one vitest summary line of their summed counts and
  `gate --hook: green` or `gate --hook: failed at <step>` (exit 1); when every step is answered only the reused
  lines are printed. A record of an older cli (no step hashes) answers the test steps with its whole key only while that
  key still matches: an older cli keyed the install on the lock file's bytes, so in practice only a package with no
  installed lock; elsewhere the steps run once and their new record answers from then on.
  Every hook run with a HEAD writes a `hook-gate` record of the index tree - only when the working files are that
  tree, before and after the steps (a partial commit leaves none) - so a later hook of the same tree, install and
  steps is answered from it. Given `DIALECTE_CHECK_STORE` (an absolute path to a git common dir: `handover run
  --rehearse` hands it to its clone's commits), the hook reads and writes that repository's store and marks its
  record `origin: rehearsal`; any other value is ignored with one line; the hook's steps never see the variable.
  It runs no hygiene and reads no hand-over hold (it runs inside `handover run`'s own commit); the tdd step runs only
  under a declared hook list. Under husky (off a terminal) each line is printed once: what the hook printed live is
  never in its result again.
  `--no-reuse` runs every step whatever the store holds, and so does a hook whose git variables name another
  repository than its folder's (the cli ignores them, so what is committed is unknown); `--hook` with `--fast` or
  `--full` is refused (exit 2). Write it in the hook as an npm script (`"test:hook": "dialecte gate --hook"`) and
  make it the hook's only line: a `check` or `build` line beside it runs a second time. The hand-over reads it as a
  test step of its own: its card line reads `reused by the hook` when every hook step was answered, and the hook's
  record names the run it was answered from (`reused`: its time and short HEAD; steps answered from several runs
  name the oldest, the step proven longest ago). Only the lines `gate --hook` printed itself are read: after a
  failing hook, the failed step's output it relays under `--- last lines of <step> ---` is never taken for one of
  its lines. The cli's own
  hook is the single line `npm run test:hook`.
- A running step looks running. Each `gate` step and `tdd`'s vitest run is announced before its work:
  off a terminal a start line `▶ <step>` (then a line every 30 s of silence and the result), on a
  terminal one spinner line `⠋ <step> - <what runs> <elapsed>` that the step's result line replaces (the
  gate's summary then leaves out the lines already shown; off a terminal and with `--json` it keeps them).
  A silent hook gets the waiting-for-input / watch-mode hint once, at 90 s of silence, on both. The
  `handover` card is as wide as the terminal's columns, else `$COLUMNS`, else 80: the box is exactly that
  wide and every line wraps inside it with a hanging indent under its text column, never into fewer
  than 20 columns of text: a hang that would leave less is reduced; a commit line whose columns
  (`<sha> <files> <+->`) leave its subject less puts the subject, and a merge lot's merge line, on their
  own rows under it, 2 columns in; a line kept to one row with `…` is wrapped whole when its cut would
  keep less; a word wider than the room after the hang (a long path) takes a row of its own, 2 columns
  in. Colour only on a
  terminal (and never with `NO_COLOR`); the `✓` `!` `✗` marks read the same without it. The command
  follows the box whole on one line, to copy: `cd <folder> && bash commit.sh`, or
  `node <this cli> handover run <folder>` when the repository's own cli does not answer
  `handover run --probe` within 60 s. "This cli" is the script that runs: when it is a temporary one
  (`npx` from the registry, `tsx` on the sources), install `@dialecte/cli` in the repository so the
  card names its own bin.
- No runner hangs silently. Every child that `dialecte gate` (its steps), `tdd` (its vitest runs) and
  `handover run` (each commit and its hooks, `--rehearse` too) start runs in a process group of its own,
  with its stdin closed (a command that reads it, such as `grep` with no file, gets end-of-file at once),
  and under a stall watchdog. Any output, a part of a line included, counts as activity; so does CPU time
  gained by any process of the child's tree (its descendants and its process group, sampled with `ps`
  every 5 s, macOS and Linux). After 10 minutes with neither, the tree is printed one line per process
  (pid, state, CPU time, command), stopped (SIGTERM to the group and every pid, SIGKILL to what is left
  after 2 s) and the run ends only once its processes are gone, as `stalled`: the gate's step fails with
  `stalled: no output, no CPU for 10 m 0 s` and the tree in its tail, `tdd`'s run fails with the tree, a
  hand-over lot is not committed and its files are unstaged (waiting a few seconds for a stopped git's
  `index.lock`; when the lock stays, the run says the files are still staged, names the lock and says
  to hand its path to the person who runs the repository, who decides once no git runs in it). A
  `ps` that fails or times out gives no verdict on that sample; failing for the whole 10 minutes is a
  stall of its own. Ctrl-C, SIGTERM or SIGHUP received by the cli is passed on to every running child's group.
  A child that asks the terminal (a gpg or ssh passphrase prompt) runs in a background group: it
  stops (state `T`) and is reported as stalled.

`gate --fast` starts with the hygiene of the worktree: nothing staged; no stash entry pushed on this
worktree's branch since `worktree add` made it (the baseline keeps every stash entry it saw, so another
session dropping one changes nothing; one stash is shared by every worktree and session: a new entry of
another branch is only noted, naming it; without a baseline the stash is not compared); and
every new file one the change declares (`--declare <path>`, repeatable; an undeclared one is a warning).
A failure says what changed and how to look at it with read-only commands.

Steps run with the runner's defaults - no lock, no `nice`, no worker cap - whoever else shares the machine.
A step that counts tests and runs vitest (its command, or the npm script it runs, names `vitest`) and fails
on its exit code or its counts is run once more with `--no-file-parallelism`, on the failing files the first
run named (through `npm run <script>` after one `--`; the whole step when the output names no file). The
rerun passes when it exits 0, counts no failed test and at least one passed: the step then passes,
flagged - `serial rerun of <n> file(s): exit 0, <counts>  flaky in parallel` on its line, one
`flaky <file>` line under it per file, the note kept in the gate record; the hand-over card's row of such a step,
or of a hook's test step `gate --hook` flagged so, reads `✓ <step>  <passed> passed · <n> flaky, passed serially`
(n the flaky files), never a failed count. Otherwise the step fails as a
`real failure: <why>`, each file listed under it as `failed <file>` when it failed again or `flaky <file>`
when it passed serially, the rerun's last lines as the tail. While the rerun runs, the step's line still
shows its own command. A step that stalled, counts no tests, runs no vitest, or already runs one file at a time
(`--no-file-parallelism` in its command) is never rerun. `--json` carries the rerun of
each step (`rerun`: files, the files still failing, status, exit code, counts).

`gate --fast` and `--full` run a `tdd` step after the hygiene (first in `--full`): every test-code file
changed since the base (test files, helpers, fixtures, snapshots) must be as the red run that last froze it
("test code changed outside tdd red"), and every case of the change red then green, or unchanged; the
others fail the gate with the list. The flags of the receipts and the deleted cases are printed under the
step. The lot file may also accept cases without a red - a new test of behaviour that already exists, an honest
cut of an assertion: `"accept": [{ "case": "<file>::<name> [project]", "reason": "..." }]`. An accepted
case passes `tdd red` as accepted and does not block its file (a case already proven red then green keeps
its proof: an acceptance never overrides one, and an accepted receipt counts only while its entry stays in
the file); the gate lists each acceptance with its
reason, the hand-over card counts them by reason from the receipts (those of earlier lots, which the file
no longer names, counted on one line), and both report an acceptance or a `revised` entry no case used (the
gate's `unused accept` line adds `; the closest: <file>::<name>` when a case title of the change is close, and
names each unused `accept`, `revised`, `gone` or `moved` entry with the `dialecte lot <list> --remove <entry>` that
drops it). An
entry names a title with its quotes folded: a straight `'` or `"` matches a curly one (`’`, `‘`, `“`, `”`) and
the reverse; nothing else (a backtick, a prime, the letter case) compares alike. The card
lists every `gone` entry with its reason; only the gate reports a `gone` entry that covers no finding. The file is strict: an unknown key, at the top or in
an `accept` entry, and an exemption without a reason are refused, naming what is wrong. A lot the orchestrator declares exempt - a wording, rename or doc-only lot - passes with its reason
and what the change touches: `{ "tdd": "exempt: <reason>" }` in `.dialecte/lot.json` at the package root
prints "exempt: <reason> (n production file(s), m test file(s) changed)". The hygiene and the hand-over
leave the file out (never committed); the hand-over card shows the exemption and the flags. A package that
does not test with vitest skips the step.

A package tunes them in its package.json:

```json
"dialecte": {
	"gate": {
		"fast": [
			{
				"name": "tests",
				"run": "npx vitest run --project unit --changed",
				"counts": "tests",
				"changedOnly": true
			}
		]
	},
	"profile": "contributor",
	"generatedDocs": [".vitepress/data/elements-catalog.json"],
	"referencePatterns": ["SPEC-[0-9]+"],
	"allowReferences": ["ticket number"],
	"baseBranch": "main",
	"rebuiltIgnored": ["coverage/"]
}
```

`gate.fast` / `gate.full` replace the default steps of that mode (`counts: "tests"` makes a step fail
when it counts no test; `changedOnly: true` marks a step that runs only the tests the change affects,
so "No test files found" passes with a note instead of failing; `restoresGeneratedDocs: true` restores the `generatedDocs` byte for byte after
it); `baseBranch` optionally names
[the base branch](../../README.md#the-base-branch); `rebuiltIgnored` lists ignored
folders a build or a run rebuilds, which `lot close` may delete with a worktree: each a folder ending with `/`,
relative to the package root, read from the `package.json` of the main checkout nearest the ignored path (a
worktree's own declaration counts for nothing); an invalid entry (empty, absolute, holding `.` or `..`, without its
trailing `/`, not a string) is ignored, and an ignored folder nobody declares keeps the worktree; `referencePatterns` adds the package's own patterns (extended regular expressions) to the
citations (and, in a contributor, the tags) `rules` and `handover` refuse; `allowReferences` is the contributor's
opt-out: it lifts generic tags a contributor commits on purpose - `ticket number`, `acceptance criterion`,
`plan tag` - and refuses any other label in either profile: a citation of a standard is never allowed. A consumer
allows every tag already, so `allowReferences` changes nothing there (`dialecte doctor` says to remove it). A lot may hold a symbolic link, a link to a
folder included: it is hashed and scanned as its target text and committed as a link, the way git stores it (a
rehearsal copies it as the same relative link).

**Scoped steps, heavy steps, the release list.** A step of `fast`, `full` or `release` may say `"scoped": true`
(never with `changedOnly`, never in `contrib.steps`): the gate resolves one base per run - `--base <ref>`, else the
merge-base of HEAD and [the base branch](../../README.md#the-base-branch), else the empty tree (everything changed) - and hands the
step `DIALECTE_GATE_BASE`, `DIALECTE_GATE_TREE`, `DIALECTE_GATE_CHANGED` (a file of the changed paths byte for byte,
NUL-separated, both paths of a rename, relative to the repository top as `git diff --name-only` names them, while a
declared `failing` path is relative to the package root) and `DIALECTE_GATE_SELECTION` (a path to write). The step writes there
`{ "schema": 1, "base", "tree", "changed": <paths judged>, "selected": [{ "id", "reasons": [...] }], "skipped": [{ "id", "reason" }] }`:
`selected` and `skipped` are both required lists, each selected id has at least one reason, the file is at most 1 MiB
and an id matches `[A-Za-z0-9][A-Za-z0-9._-]{0,63}`. A missing or invalid selection, another base or tree, or another
count fails the step. An empty selection should exit 0 without starting vitest: it passes with
`nothing selected since <base> (<n> paths changed)` (`1 path changed` for one); a non-empty selection on a
`counts: "tests"` step that runs no test fails (`no test ran`). The step selects from the working files (never
`git show <tree>:`), so what it selects and what it runs are the same code. A failing step counting tests is rerun
once, serially, with its failing files appended as plain arguments (after one added `--` only when the step runs
through `npm run` and its command holds none), then `--no-file-parallelism`, with the same base, tree and changed file
and a new selection path: the rerun must select the same ids, and a script running vitest more than once passes
`--passWithNoTests` to each invocation (or runs one). A scoped step whose command (or the npm script it runs) does not
name vitest is rerun whatever runs it, when it exited non-zero on a test failure (a failed test counted, a `FAIL` line,
vitest's `Unhandled Errors` or `Errors  <n> error` summary); for such a step a plain script error fails as itself. A
scoped step that names vitest keeps the rule of any vitest step: rerun on any failure. A first run whose selection is
not valid is never rerun.
The selection may declare `"failing": ["<path>", ...]` (relative to the package root, no `..`, no backslash; a leading
`./` and repeated `/` are normalised away): a failed step records those files with the ones its output names
(`failing` in the record and in `--json`; the card's row ends `· failing <n>: <first 3>`).
Run outside the gate (no `DIALECTE_GATE_SELECTION`), a scoped script selects everything. The base enters the record's
key, so a run at another base never reuses. `"heavy": true` marks a heavy suite (a browser suite); it is outside the
command hash. `gate.release` is the list `gate --release` runs (default: the `full` steps, derived ones included),
every scoped step against the empty tree (`--base` with `--release` feeds only the tdd step); it _covers full_ when
every `full` step is in it with the same `name`, `run`, `counts` and `changedOnly`, and only then does its green
record answer a commit hook, a rehearsal, contrib and the card. An environment switch that changes what runs belongs
in the step's `run`. A gate config the cli cannot run (a list that
is no list of steps, a step without `name` or `run`, a `scoped` or `heavy` that is no boolean, `scoped` with
`changedOnly`) is refused naming the list and the step: `gate`, `contrib` and `handover run` exit 2, `gate --hook`
exits 1, the card prints `✗ gate  invalid gate config: <message>`.

**Opting out of a default step.** A package that has no use for a default step (no skills folder, no type
benchmark yet) says so, with a reason, instead of wiring a script:

```json
"dialecte": {
	"gate": { "skip": { "skills": "no skills folder in this package" } },
	"contrib": { "skip": { "type-bench": "no type benchmark yet" } }
}
```

`dialecte.gate.skip` serves the default steps of `fast`, `full` and the release list that follows `full`;
`dialecte.contrib.skip` the default `contrib` steps (`docs`, `type-bench`) when `contrib.steps` is not declared.
A skip is only for a default step the package cannot run: an `npm run <x>` step whose script `x` is missing. A reason
is a non-empty string of one line and at most 200 characters. A name that is no default step of a mode with no
declared list, a step the package can run (its script is there, or it runs no npm script, as the default `tests`:
`"tests": skip is for a step the package cannot run; remove the skip`), an empty or too long reason, or a `skip`
that is no map is refused like any gate config (exit 2, naming the key and the name): an opt-out cannot go stale
unseen, and adding the script makes its skip refused until it is removed. An opted-out step runs in no mode (`skip  skills
opted out: <reason>`; the card warns, never blocks), and a step the package declares has no opt-out: remove it or add its
script. Adding or removing an opt-out changes the gate record's key, so the gate runs again.

In a lot's own worktree, `--fast` and `--full` end with the lot's conflict forecast (the step `lot forecast` runs,
recorded in the lot folder's `forecast.jsonl` with trigger `gate`): `forecast: <verdict>`, then one
`! <against>: <why>` line per comparison it does not clear (a conflict with its files and ranges, a shared lock file,
or why it is unknown), said after the steps and before the notes and the verdict; `--json` carries `forecast`
`{ verdict, lines }`. It warns only: two lots whose work collides both see it on their cards, the one landing second
merges main and resolves, and the gate's verdict and exit stay what its steps made them. A review round's throwaway
worktree and `--release` run none.

`gate --hook` runs a `design` step first when the commit is on a lot's branch, from any worktree, whatever
`dialecte.gate.hook` declares: a commit holding a production path fails while the lot's required design is missing, not
approved or stale, no declared step runs, and the lot's events record the refusal; a commit of tests or docs only
passes; a first commit, a merge commit and a review throwaway (`<lot branch>-round-<n>`) skip it.
The step and the tdd step read the same lot base, resolved once for the run.
