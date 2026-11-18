# dialecte tdd

<!-- dialecte-reference: generated from the command map by npm run doc:generate; edit the map, not this block -->

Receipts that each new test failed on an assertion before the code, then passed untouched

```text
tdd - Receipts that each new test failed on an assertion before the code, then passed untouched

  dialecte tdd red [<test file>]... [--base <ref>] [--json]
  dialecte tdd green [<test file> | <test file>::<case name>]... [--base <ref>]
  dialecte tdd status [--base <ref>] [--json] [--flags] | tdd status --legend

  red - every case of the changed test files must fail on an assertion (or a stub's 'not
        implemented' inside an asserting expect); a passing new case, a missing export, a type or
        syntax error, a timeout, a .only is refused; the files without a refusal are frozen
  green - each case with a red receipt, its test code as frozen, production changed since its red,
          passes; records a green receipt
  status - per case red, green, unchanged, missing receipt, test edited after red, flags
  base - the change is measured from the lot base: HEAD's fork point from the base branch (the newer
         of the local branch and origin's), or from an open stack parent's line; HEAD only when no
         base branch is found; a green taken before a rebase still counts after it
  --base - measure from where HEAD left the ref given instead of the lot base
  declarations - a gone or moved entry of the lot file naming a path the change leaves unchanged, or
                 one known nowhere (not at the base, not now, not in the receipts), is refused
                 before any run, naming its lot gone --remove or lot moved --remove; a test file
                 deleted on disk is a deleted file, never read
  --legend - the tdd terms of the hand-over card

e.g. dialecte tdd green
```

Verbs: `red`, `green`, `status`

Flags: `--base`, `--json`, `--flags`, `--legend`
<!-- /dialecte-reference -->

- `dialecte tdd red|green|status [<test file> | <test file>::<case name>]... [--base <ref>] [--json]` makes
  the order of the work visible: tests written from the spec before any code, red for a real reason, then
  made green by an implementation that did not touch them. The ledger lives in the worktree's git folder,
  never in the tree. Each test file runs under its own runner, inferred from the file (no setting): a Python
  file pytest's own discovery collects under pytest, a JS/TS test file importing `node:test` under `node --test`
  (even inside a vitest package), a file a vitest config holds under the package's own vitest (each project's run
  of a case is a case of its own), with snapshots never written
  (`--update=none`, CI): a snapshot test's snapshot is written by the test station before the red. One progress
  step per runner, in that order: vitest, `node --test`, pytest; a run that fails stops the later ones.
  - node --test: the cli's own reporter reads node's events. A case's name joins its describe titles with `>`;
    `tdd red <file>::<case>` runs it alone (`--test-name-pattern`). A failure inside a `node:assert` call
    (`assert.equal(...)`, `t.assert.equal(...)`, a named import from `node:assert/strict`) is inside an
    assertion; an import failure or a throwing `describe` refuses the file with its error; a node timeout is a
    timeout. The run passes no node flags of its own (a package needing `--import <loader>` is not covered). Node
    has no collect-only mode: the gate's tdd step runs a listed node test file in full.
  - pytest: a Python file is a test file when pytest's discovery would collect it, read from its pytest folder
    (the nearest `pytest.toml`, `pytest.ini`, `pyproject.toml` `[tool.pytest]` / `[tool.pytest.ini_options]`,
    `tox.ini [pytest]` or `setup.cfg [tool:pytest]`, else the package root): its `python_files`, `testpaths` and
    `norecursedirs` (pytest's defaults when not declared). It runs there with its interpreter (a `.venv` from that
    folder up to the repository root, else `uv run --frozen python` beside a `uv.lock`, else `python3`; on
    Windows `.venv\Scripts\python.exe`, else `python`), through a pytest plugin the cli ships; a file a conftest's
    `collect_ignore`, `collect_ignore_glob` or `pytest_ignore_collect` leaves out prints `outside  <file>  not a
    test file pytest collects (...)`, never refused nor frozen. A case's name joins its class and function with
    `>`, parameter ids kept (`TestRows > test_row[2]`). `NotImplementedError` is the stub; an `assert`
    statement or the body of `with pytest.raises(...)` / `pytest.warns(...)` is inside an assertion (a stub
    result asserted later is refused, as in TS); a `pytest.raises` / `pytest.warns` miss is an assertion;
    `ImportError: cannot import name ...` or a missing attribute of the package's own module is a missing
    export. A row added to a parametrize table is a change of that row only; the case's other decorators must
    stay as the base holds them, in order and count. The conftest files, the helpers a test or a conftest
    imports and the files a case opens are frozen on red, production never (the gate's collect-only listing
    sees no file a case opens only in its body; it judges by the receipts' frozen hashes). A run writes no
    `__pycache__` or `.pytest_cache`, and xdist is off for it. A pytest case moved to another file is a new
    case. No pytest in the interpreter: the run fails naming the folder.
  - `red` given only `<file>::<case>` targets runs only those cases, whatever the runner.
  - `red` runs every case of the changed test files (or of the files named). A case that fails on an
    assertion (a snapshot mismatch included), on a stub's error (a message starting with
    `not implemented`) or on an error existing code throws, inside an `expect(...)` a matcher completes,
    gets a red. Refused, each with its reason: a passing case that is new or changed ("it ran green: this
    test proves nothing yet"); a passing case with a receipt whose own test call changed; a passing case
    still waiting for its green whose test file, or test code it imports, changed since its red ("test
    code changed since its red and it passes"; a `revised` entry naming such a case, or a passing new
    case, runs it on the base instead, below); a failure on a missing export, a type or syntax error, a
    timeout, a stub thrown at import or before the assertion; a file holding `.only` or `only: true`; a
    file whose run reports no case, `red` and `green` alike, with why the package's vitest configs (every
    `vitest*.config.*` and their `projects`, read as files) give: `ran no case: the file belongs to
    <config>, which the default config does not list (projects)`, `ran no case of the file` (the default
    config holds it: an empty describe, no test call; or a config cannot be fully read - an `include`,
    `exclude` or `projects` entry that is no string literal or inline object, such as an imported constant,
    a spread, a call or a glob of config files - and may hold it), `every case is skipped` (only `.skip` /
    `.todo` / `.skipIf(true)` cases; the gate, which only collects, maps each case the run reports to its
    test call, so a case a helper registers counts as run). A refused file is never frozen, and the gate's
    tdd step fails on it with the same reason. A file
    no runner holds (a Playwright spec, a type test) is no test file: it leaves the selection with
    `outside  <file>  not a test file of a known runner (no vitest config includes it, no node:test import)`, is never
    refused nor frozen, and never fails the gate. A
    case the same as at the base is marked unchanged; a case the lot accepts is marked accepted, unless
    it is proven red then green at its current test call (an acceptance never overrides a proof: it goes
    the normal path, no accepted receipt, and the line adds `acceptance not needed (proven red → green): it
    can be removed from the lot file`); a green
    case whose test code changed around it is kept and flagged `test code changed around it` (the next
    step adding a case to a green file); a case never proven green (only unchanged, accepted or revised)
    is kept without a flag, and no receipt. A file with a refusal still records its other cases'
    receipts, the refusals kept as evidence; it is frozen when one of its cases is red (those need no re-red;
    the refused case stays unproven), else not frozen; the gate fails on it until no case of it is refused.
  - Two cases of one run sharing a file, a project and a name share one id, and a receipt names one case: every
    case of such a group is refused (`red` and `green`), whatever its state, with `2 cases share this id
    (lines 12, 12): <hint>` (a case without a location prints `?`). The hint is `rename one` for two plain
    calls; for a case of an `.each` / `.for` table (or under one) it says to spell each title in full:
    vitest cuts a `$` field of an each-title at its `truncateThreshold` and prints any array as `[ Array(n) ]`, so
    two rows can read the same; `truncateThreshold: 0` in the package's vitest config is the other fix. A member
    the run does not judge (skipped, filtered out by `-t`, not targeted by `green`) gets a `duplicate  <case>
    <reason>` line and no receipt. The cases of the group stay out of the move matching, the rest of the file is
    judged as usual, and the exit is 1. `--json` holds `duplicates: [{ file, project, name, lines }]` (empty when
    none). The `gate`'s tdd step fails (`duplicate case ids in <n> file(s): <files>`) and the card's tdd section
    lists `✗ duplicate id  <file>::<name>  lines 12, 12` per group, so the hand-over is BLOCKED. A receipt
    recorded before under an id now shared never counts.
  - A red records the case (file, full name, project), the hashes of its test file, of its own test call
    and of the production files, the failing message and the time. It is flagged `rollback` at a
    production state the case, or the lot, had already left: a production file moved back from the
    newest content the lot reached to its content at the base or at an earlier receipt (the run prints
    one `rollback:` line naming the files). The ledger keeps, per base and per production state a receipt
    names, the content of each production file changed since that base. The receipts are walked in
    order: a green, or a receipt at a state moving nothing back, makes its state's contents the newest; a
    put back only reds, refusals or unchanged receipts saw stays put back and adds no content, so a
    later red there is flagged again, a restore is not, and a step a green proved (an experiment undone
    and kept) is the new newest. A green run taken at code put back still makes its state the newest;
    its receipts are flagged `rollback`, with the same line, only when a case the run proves had no
    green receipt before (of the same file, name, project and test call; a refused run is no green, an
    earlier green counts whatever its flags): a refactor that keeps proven cases green (drops a file the
    lot added, puts a file back to its content at the base) is not flagged, a green run proving a case
    for the first time there is. Content the refactor
    moved away stays reached: bringing it back later flags the reds and the first greens taken there.
    A state read at another
    base, a lot committed since, is not compared;
    `red after green` when the case's own last receipt is a green at the same production state;
    `red on base` when a revised case earned it on the base's production (below), its production hash the
    base's. `tdd status`, the hand-over card and `tdd status --legend` show the flag.
  - The run freezes each test file without a refusal, and a changed helper, fixture or snapshot only when
    a case of a file depending on it went red, or was recorded revised, in that run: what it imports
    (relative, tsconfig `paths` or vite alias, barrels and re-exports followed through test code; a
    package name is a dependency, not test code), a changed file whose name its test code mentions, or
    the text of a production module its test code imports directly (a constant naming a fixture; one hop
    into production, never further, and the module itself is production), its own snapshot. Every
    dependency found by import is followed in turn, and one found by a name written with its folder
    (`fixtures/scan.ts`, a full path): it brings the files it imports (`import type` included). A bare
    file name (`index.ts`) may be another file: the changed file it names is a dependency, not followed. The
    `setupFiles` of the package's vite or vitest configs (test code no test imports) are a dependency of every
    test file, followed as an import: a red freezes a changed one, a `revised` entry naming it lets a red
    freeze it. A helper no red covers stays unfrozen, and the gate fails on it, unless a `revised` entry names it
    (below). A Vite import query or fragment (`./x.worker?worker&url`, `?raw`, `?url`, `?inline`, `#part`) is
    left out of the file the import names; a specifier starting with `#` is a subpath import. The files of
    the change an `import.meta.glob(...)` of its test code matches (a pattern relative to the file, `/` for
    the package root, or a vite alias; a negated `!pattern` leaves its files out and names none) are
    dependencies too, followed like an import. An import that looks local (`@/`, `~/`,
    `#`, a `paths` or alias prefix) and resolves nowhere refuses its file, naming the import as written.
  - A changed test helper no changed test file depends on is frozen by `tdd red` through the unchanged test files
    importing it, when they pass with it; one failing, or none importing it, leaves it unfrozen with the reason (a
    `revised` entry naming it still freezes it).
  - Suite infrastructure: the files the vitest configs name in `setupFiles` and `globalSetup`, and the test
    helpers they import, are production for tdd. A lot fixing the suite gets red on the infrastructure as it is,
    green once fixed. A helper no setup file imports, or one that test files other than its own unit test reach
    too (an assertion helper), stays test code.
  - A test-code file moved with its bytes as at the base (git's R100: a deleted path and a new one,
    added or untracked, holding the same blob) is no change: a moved test file's cases are `unchanged`
    with no receipt to hold, its old path lists no deleted case, a moved helper or fixture waits for no
    freeze. A move stays within one kind (a test file to a test file, other test code to other test code;
    an empty file never pairs): a test file renamed off (`a.test.ts.off`) lists its cases deleted, one
    renamed on is a new file. A move with an edit is a new file and a deleted one. A change that only
    deletes test files lists their cases `deleted` in the gate's `tdd` step.
  - Cases moved out of a test file (a file split in several, a case cut out into another file) keep the
    base's proof with no declaration. A case of a new or changed test file is `moved` when its test call,
    by tokens (those its case hash reads), under the same describe path, is in the base text of a test
    file the change deletes, or of a changed one that no longer holds that call under that path, and its
    own file's base did not hold it; a case of the same name and project matched in two files is moved
    from neither (`ambiguous  <case>  in <files>: moved from none of them`). A moved case is a case of the
    base: `tdd red` records it `unchanged` when it passes (and freezes the helpers its file depends on),
    and with no receipt yet `status`, the gate and the card read it `unchanged`. `status` and the gate's
    details print one line per source file, `moved  <n> case(s)  <old file> → <k> file(s)`, with
    ` · test code changed around them` when a target's code outside its test calls (imports, hooks, helpers,
    under the describe paths it keeps) differs from the source's base, read by the same tokens; the card's
    tdd section shows the line, and a deleted source is reported by it instead of as deleted. A case a
    helper registers (the call at its location is no test call: `checkRow(row)`) is `moved by name` when a
    test file the change deletes, or that registers fewer cases now, registered one case of the same name
    and project through a runner at the base:
    `moved by name  <n> case(s)  <old file> → <k> file(s) · runner changed: <base call> → <new call>`. Those
    base names come from one collect-only run of the base files (no test executes), paid only when a split
    is detected statically (a test file deleted, or a changed one whose base ran a registering statement
    outside its test calls, by tokens, that it no longer runs; a row added to a table is no split), in a
    scratch copy of the base tree outside the worktree removed after it, bounded
    at 5 minutes; `status` prints its duration (`base collect  <n> file(s)  <duration>`).
  - `green` runs the changed test files: each case needs a red receipt, its file, its test call and its
    test code as frozen, production changed since its red ("nothing in production changed since red"),
    and a pass.
  - `status` prints each case (red, green, unchanged, accepted, missing receipt, test edited after red,
    with its flags), one `skipped  <case>  <receipts>` line per case with receipts the read rule skips
    (below; the gate's details too), the test code changed outside `tdd red`, and the cases the change
    deletes. A test
    call of the base gone without a title (an `it(name, ...)` whose title is a variable: an edited call
    looks deleted) prints `deleted <file> a test call of the base is gone`; when a `gone` entry of
    `.dialecte/lot.json` names its file (a path or a glob), it prints
    `gone <file> a test call of the base is gone (<reason>)` instead, in the gate's details too. A titled
    test gone and a deleted test file stay `deleted`. A changed test file whose run reports no case prints
    `refused  <file>  <reason>` (the reasons of `red` above), one no runner holds `outside  <file>
    not a test file of a known runner (no vitest config includes it, no node:test import)`. A ledger that cannot be read is refused with its
    path. `--json` answers the state: `cases`, `duplicates`, `unfrozen`, `findings`, `unlisted`, and, only
    when there are some, `zeroCases: [{ file, reason }]` (the refused files) and `notVitest: [<file>]` (the
    files out of the selection).
  - `status --flags` prints only the cases whose receipts carry a flag, with their flags.
  - `status --legend` prints the tdd terms of the hand-over card, each in two lines: what it means, and
    whether to look. It needs no package: it works from any folder.
  - One base for `tdd red`, `green`, `status`, the gate and the commit hook: the lot base, HEAD's fork point
    from the base branch (`dialecte.baseBranch`, origin's default branch, `main`, `master`; the newer of the
    local branch and origin's), or, for a store lot started on another open lot (`lot start --on`), from that
    parent's line (`lot land` takes the base once the parent merged). A rebase onto the base's new commits
    moves the base with it, so a green taken before the rebase still counts after it, and a plain `tdd green`
    proves the lot's committed cases again after a production change (the hook's stale-green refusal names the
    base all the same). `--base <ref>` measures from where HEAD leaves `<ref>` instead. With no base branch
    found and none configured, the change is measured from HEAD; a configured base branch that names no branch,
    or a lot base git cannot read, fails the command. The first details line of the gate's tdd step (none when
    the step is skipped) reads `tdd base: <short sha> (<source>)`, the source one of `--base`,
    `lot base <ref>`, `HEAD (no base branch found)`.
  - Test code is read through one presence map of the change since the base (`git status` and
    `git diff --name-status` against the base, git's rename pairs included): each path is added, changed,
    renamed or deleted, and a test file deleted on disk (plain `rm` or `mv`, staged or not) is a deleted file,
    never opened. A `gone` or `moved` entry of the lot file naming a path the change leaves present and
    unchanged, or one known nowhere (not at the base, not now, not in the receipts), refuses `red`, `green` and
    `status` in one line ending `drop it: dialecte lot gone --remove <path>` (or `lot moved --remove <from>
    <to>`), before any run; a glob is never refused this way (the gate names an entry that matches nothing as
    unused).
  - Test code is compared by the leaves of the parser's syntax tree, each file parsed by its extension
    (a `.ts` file is no TSX): whitespace, comments (except the ones a tool reads:
    `@vitest-environment`, `@jest-environment`, `@vite-ignore`), quote style, statement semicolons,
    trailing commas after an element and the order of import statements between side-effect imports
    are formatting (a formatter pass needs no new red); template literals count by their raw text; any
    other edit is a change. The receipts are a version-3 ledger: an older one is refused, to be moved
    aside. A repository without a commit is refused in one line.
  - A package whose test entry is production code declares it:
    `"dialecte": { "tdd": { "production": ["src/test"] } }`; the test files, fixtures, snapshots and
    `*.script.ts` under such a folder stay test code. `testCase.only ? it.only : it` is no focus marker.
  - A case edited at review after it was proven is declared in `.dialecte/lot.json`
    (`"revised": [{ "case": "<file>::<name>", "reason": "<why>" }]`). It needs an earlier receipt of
    the case (a red, an unchanged, an accepted one), not necessarily a red, or to be a case of the base:
    its file exists at the base, every title of its name written as a string now is written there too,
    and, when its own title is the literal title of an `it` / `test` call at the base or now, the base
    holds such a call with its describe path (a computed describe title, a `describe.each` /
    `describe.for` format, matches any; a `describe.skipIf` / `describe.runIf` suite counts by its
    title) and the file now no more of them (a test moved to another describe, or a string of that title
    removed elsewhere, is no proof); otherwise (a table row, a computed title) its own title is written
    as a string there and no more times now. A new case (a new file, a new title, a row added to a table)
    no `revised` entry names still needs a red. A passing case a `revised` entry names that is not
    provably a case of the base (a new case, a title the file computes and the base does not write), or
    one still waiting for its green whose own test call changed since its red, is run once more on the
    base, the base as round 0: its file runs, filtered to the case, under the same runner, in a throwaway
    copy of the base's tree in the temporary folder (`git archive`; a `node_modules` folder of its own
    linking each entry of the package's but its caches, so Vite writes its cacheDir and bundled config in
    the copy) with the lot's current test code laid over it (test files, helpers, fixtures, conftests,
    snapshots at their current bytes, the deleted ones removed; production stays the base's). A pytest
    file runs there with the lot's own interpreter (its `.venv`, `uv run --project <lot folder>`, or
    `python3`, resolved from the lot's folder), through a bootstrap that puts the copy's pytest folder first
    on `sys.path` and drops the current folder before pytest is imported, whatever the python's version (and
    the copy's folder first on `PYTHONPATH` for the processes its tests start). Red there for a real reason: a red receipt flagged `red on base` at the base's
    production hash, its file frozen as at any red; `tdd green` then proves it as any red. Otherwise
    refused, nothing frozen: `passes on the base too: the revision proves nothing; prove it red or accept
    it: lot accept <case> <reason>`; a thrown error (never an assertion or a stub's red, whatever its
    message says) that is a missing file or path by its code or name (`ENOENT`, `FileNotFoundError`, a
    module-not-found code for a relative or absolute path) `the base copy lacks a git-ignored input, not a
    proof`; a pytest package its interpreter holds installed editable (`direct_url.json`
    editable, an `__editable__` or `.pth` file of the project its `pyproject.toml` names) `the package is
    installed editable: a base run would import the lot's code`; a failure that is no red, with its kind's
    reason; a case that did not run there. The lot's tree is never touched: the throwaway folder (it holds
    its owner's process id) is removed after the run, and the next `tdd red` or `tdd green` trashes those a
    killed run left (older than the running process, their owner gone). A revised case that is a case of
    the base is recorded revised at once, with no base run. The `case` may also be a file path or
    a glob over file paths (`scripts/**/*.test.ts`: `**` any folders, `*` and `?` within one), relative
    to the package root, without `::`: it applies to every case of the matching files, with one reason.
    A file or glob entry never covers a case whose last proof is a red still waiting for its green, and
    keeps the `red after green` flag of a case made red again; an exact entry covers both. An `accept`
    entry stays one exact case. The next `tdd red` records it as revised when it passes (a
    red when it fails) and freezes its file and the changed test code it depends on. A file or glob entry
    may also name a test helper (test code that is not a test file: a helper, a fixture, a constant beside
    the tests) edited at review while its dependent cases stay green: the next `tdd red` freezes it at its
    new hash and prints `revised  <helper>  <reason>`, when every changed test file depending on it
    is in the run and frozen by it with no case red (a refused file, a red still waiting for
    its green, or a changed dependent outside a targeted run leaves it unfrozen, named on an
    `unfrozen  <helper>` line). A helper that no changed test file depends on (its dependents are all
    unchanged since the base) is frozen by any `tdd red` whatever its files, with the entry's reason. The new freeze makes the dependent
    cases' earlier green stale: `tdd green` proves them again. Without that red run the gate fails on the
    edit; `status` lists the revised cases, the gate and the hand-over card list the revisions (cases
    and helpers) with their reason, an entry (exact, file or glob) no revised case or helper used as a
    note. A `revised` entry covering a proven case nothing changed since its proof (same test call, test
    code as frozen) records nothing: the line reads `kept  <case>  proven before (<kind>)  revision not
    needed (nothing changed since its proof): <reason>`, and the entry stays unused.
  - A receipt counts only while its declaration holds (the read rule of `tdd red`, `tdd green`,
    `tdd status`, the gate and the card): an `accepted` receipt whose `accept` entry the lot file no longer
    holds, or that a red then a green of the same test call precede, and a `revised` receipt no `revised`
    entry (exact, file or glob) covers any more, are skipped, and the case reads from its earlier proof (a
    case whose file was frozen again after its green owes a fresh `tdd green`). Nothing in the ledger is
    rewritten; the flags are read from every receipt. A skipped receipt is named:
    `skipped  <case>  1 accepted receipt (no longer declared)`, or `(proven red → green before it)`.
  - What it cannot see: the receipts can be written by an agent with a shell; a deliberate throw in
    production looks like a stub; code written first, hidden, then a red taken at the base state, cannot
    be told from an honest red (at the first step the red's production is the base's). The flags and the
    refusals make the rest visible; the review reads the diff.

`tdd red` in a lot's own worktree first holds the lot to its design: while the lot needs a design that is missing, not
approved or stale, it refuses (exit 2), runs nothing and names the next `dialecte lot design` command.
