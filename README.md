# @dialecte/cli

The Dialecte **CLI**. Type-performance benchmarking, coverage probes, and readability
audits for any Dialecte — and for `@dialecte/core` itself.

> Dev-time tooling. It is **not** a runtime dependency: it shells out to the consumer's own `tsc`
> and reads its schema, so a dialect's published library never ships any of this.

## Install

```bash
npm i -D @dialecte/cli   # provides the `dialecte` binary
```

`typescript` is a **peer dependency** — the CLI uses the consumer's installed compiler so the types
`audit` renders come from the exact same `tsc` that `bench` measures with.

## Commands

```
dialecte coverage          # generate complete, schema-driven type-coverage probes
dialecte bench [--check]   # measure the type-instantiation cost of your own types (library .d.ts skipped); --check gates CI
dialecte audit             # render the public type surface and flag readability issues (C1–C6)
dialecte skills sync       # install the agent skills your dependencies ship, for your agents
dialecte skills generate   # refresh the generated blocks of this package's skills
dialecte skills check      # fail on a skill citing what the code no longer has, or an undocumented public function
dialecte api find "<need>" # find a method by what you need
dialecte api show <path>   # read one method's contract
dialecte members <expr>    # what an expression of the live types holds
dialecte schema <Tag>      # what an element may hold and where
dialecte models            # which model each tier (fast, standard, strong, frontier) means for your vendor
dialecte doctor            # versions, core API generation, skills and station agents in sync, local checkouts
dialecte rules             # code-rules self-check of the changed files
dialecte gate [--full]     # the package's Definition of Done, with the real counts
dialecte lock run -- <command>  # any heavy command under the machine lock gate and tdd take
dialecte tdd red|green|status   # receipts: each new test failed on an assertion before the code, then passed untouched
dialecte new verb <namespace> <query|transaction> <name>
dialecte handover <lots.json>   # the guarded commit-by-lots hand-over a human runs (run, list)
dialecte handover --legend      # every term of the hand-over card: what it means, whether to look
dialecte worktree add|prune     # a worktree ready to work in (sibling links, node_modules checked); what a merge left behind
dialecte record review|decision|snapshot   # a lot's findings ledger and round snapshots, in its hand-over folder
dialecte record choice <folder> --by <who> <decision>   # a decision made outside the ledger, in decisions.md
dialecte recap <folder>    # the pull request's expandable part, built from the hand-over's records only
dialecte text check <file> # the human part of a GitHub text: its fixed headings and its word cap
dialecte review delta <folder> --round <n> # the fix diff since round n-1; --worktree: the old code to run a test on
dialecte run <script.ts>   # run a script on an in-memory project of the installed dialecte: one structured outcome
dialecte fixture <Tag>     # the smallest valid XML document holding an element, built by the dialecte's engine
dialecte explain <code>    # what an error or diagnostic code means, when it is raised, the usual fix
dialecte --help
```

## Zero-config

A dialect is built by convention: `src/<version>/definition/{constants,definition}.generated.ts`, and
its hydrated namespace is the **capitalized package name** (`@dialecte/scl` → `Scl`). The CLI discovers
every version + the namespace with **no config**, emitting benchmarks per version under
`benchmarks/types/<version>/`. `@dialecte/core` is detected by name and benched via a built-in generic
_test_ dialect.

Everything is overridable per `package.json` `"dialecte"` field (odd layouts) or CLI flags:

```
--namespace <Name>  --entry <import>  --constants-dir <dir>  --out <dir>  --version <v>  --tsconfig <f>
```

Env: `RUNS=5 dialecte bench` (repetitions kept as the min); `COVERAGE_CHILD_CAP=N` (cap child edges).

## Agent skills

Every Dialecte package ships the agent skills that describe it in `skills/<name>/SKILL.md` (open
[Agent Skills](https://agentskills.io) format), versioned with its code.

- **In an app**: `npx @dialecte/cli skills sync` links the skills of your `@dialecte/*` (and any other)
  dependencies into `.claude/skills` and `.agents/skills` (Codex, Cursor, Gemini CLI, Copilot read the
  latter; add `--agent copilot` for `.github/skills`). Links follow your installed versions; rerun after
  adding a dependency. `--copy` writes copies instead of links.
- **Station agents (Claude Code)**: when Claude Code is a target (the default) and the project's model vendor
  is anthropic, `skills sync` also writes one agent per station of `dialecte-lot` into
  `.claude/agents/dialecte-<station>.md`: `implementer` and `fixer` (standard tier), `implementer-strong` and
  `reviewer` (strong), `eval-runner` and `standard-reader` (standard), `grader` and `searcher` (fast). Each file
  sets the model (from the `dialecte models` map, as the alias Claude Code accepts: `sonnet`, `opus`,
  `haiku`) and the tools: the reviewer holds the read tools and Bash (it runs the tests) and no Write or Edit,
  the searcher and the grader hold read tools only. The body is a few lines naming the station, the skills to
  load and the never-list; it never copies a skill. The files are owned through the manifest: replaced on
  every sync, removed when no longer produced, and a file of your own with the same name is reported, never
  overwritten. `dialecte doctor` warns about a stale or missing one. Other hosts (Copilot / VS Code, Codex,
  Gemini) get no agent files from this command yet: the tier of each station comes from `dialecte models`
  there, as the `Tier:` line of a brief says.
- **Session-start check (Claude Code)**: `skills sync` adds a `SessionStart` hook running
  `npx --no-install @dialecte/cli doctor --brief` (the installed cli: no download at a session start) to
  `.claude/settings.json`, inserted by a minimal text edit (the rest of your file stays byte for byte), never
  duplicated, removed when you drop the claude target. If you edited the hook's text since, removal cuts only
  our handler (a comment right next to it may go with it) and writes nothing when anything else would change. Agents and hook are written only when `dialecte-lot`
  is installed for Claude Code. `doctor --brief` prints nothing when the skills, the
  versions and the station agents are in sync, otherwise one line per problem with its fix, and always exits 0.
  `--no-session-check` leaves the hook out (and removes the one a sync added). Elsewhere, the `dialecte` skill
  tells the agent to run `doctor` first.
- **Working on Dialecte**: `npx @dialecte/cli skills sync --from ../` takes them from your local checkouts.
- **In a package**: `dialecte skills generate` rewrites the `<!-- dialecte-skills:generated <kind> -->`
  blocks (`extensions`, `core-methods`, `hooks`, `api`, `intents`) from the source; the `api` block lists
  the methods, then one section per package entry (each `exports` subpath shipping a `.d.ts`) with the
  functions it exports.
  `dialecte skills check` verifies every API, path and npm script a page cites, and that every public
  method and every function an entry exports (not `@internal`) has a JSDoc summary and an `@intent` tag; it warns when a summary or an
  intent quotes a sentence, since the generated pages republish the JSDoc. A page about several
  repositories declares `<!-- dialecte-skills workspace -->` and is fully verified with
  `--workspace <folder>`; a deliberate outside mention goes in `<!-- dialecte-skills ignore: token -->`.

## Lookups for agents (and people)

Each answers in a few lines, the same with or without the Dialecte repositories, and takes `--json`.
Exit codes: 0 an answer, 1 nothing found (or a warning for `doctor`), 2 a usage error.

- `dialecte api find "<need>" [--package <name>] [--limit 5]` searches the `api.json` every installed
  package ships next to its skill's `api.md` (written by `skills generate`): one line per method - route,
  `q | tx | doc | project | export`, the intent that matched, the package. Ranking, in order: how many words of the
  need the method's `@intent` tags hold, then its summary, then its name - one intent word beats any number
  of summary words; stop words dropped, word forms reduced to a light stem (`copied`, `copies`, `copying`
  → `copy`); ties put a dialecte's verb before core's, then sort by route.
- `dialecte api show <path>` (`info.of`, `doc.query.info.of`, `tx.reference.applyUuidRemap`): signature as
  declared, summary, intents, other routes, where it is declared in its repository, and one call: the
  method's JSDoc `@example` when it is short and calls the method, else a call from the test next to it
  whose arguments a caller can copy (written-out values first; never a test case field, a fixture constant
  or a cast). No such call, no example.
- `dialecte members <expression>` (`doc.query`, `doc.query.reference`, `tx.lifecycle.extract`): the
  IntelliSense walk on demand, from the live types of the package where it runs. In an app, point it at
  the namespace holding your project's types: `--namespace <Name> --entry <module>`.
- `dialecte schema <Tag> [--package <name>]`: parents, children in order with how often each may appear,
  attributes (required, identity, default, fixed, enumeration, pattern), text, xsi:type variants - read
  through the readers of the core each installed dialecte depends on (how often a child may appear is core's
  `childOccurrences`). An unknown tag answers the closest; a dialecte not built is reported as skipped.
- `dialecte doctor`: installed `@dialecte/*` versions, the core API generation of each dialecte (read from
  the core it resolves; a dialecte on another core than your app's is a warning), whether the synced skills match node_modules (a skill missing; a copied skill of
  another version than the one installed - linked skills follow node_modules), local checkouts (siblings,
  `$DIALECTE_ROOT`); each warning with the one command that fixes it.

- `dialecte models [--vendor <id>] [--json]`: the model each tier means for the vendor the project uses
  (`anthropic`, `openai`, `google`), one line per tier, the date the rows were checked and what each tier
  is for. Agents name a tier (`standard`) and ask this command which model that is. The vendor is the one
  `dialecte skills sync` remembered as `vendor` in `.dialecte-skills.json`, in every skill folder of the
  project. Sync detects it from the project (`.claude/`, `AGENTS.md` + `.codex/`, `.gemini/`; a folder holding
  only the skills a sync wrote is no evidence) and asks on a terminal when several agents, a multi-vendor host
  (Copilot, Cursor) or none are found. Without a terminal, a first sync that cannot tell (no manifest, nothing detected) exits 2 naming
  `--vendor <id>`, which also sets it without asking; a project that already has a manifest and an ambiguous
  or empty detection keeps syncing without a vendor and is told how to set it. When manifests disagree, `models` warns on stderr, naming them, and uses the
  most recently written; an unknown vendor id in a manifest is ignored with a warning. Exit 1 for an unknown
  `--vendor`, 2 when no vendor is known.

Run outside a package (no `package.json`), each answers a usage error.

## MCP server

The MCP server of the read-only lookups is its own package: [`@dialecte/mcp`](https://github.com/dialecte/mcp) (`npx @dialecte/mcp`). It builds on the pure answer functions this package exports at `@dialecte/cli/lookups`.

## Contributing to a Dialecte package

Eleven commands for whoever changes a Dialecte package, a person or an agent. Each answers the same way
every time: exit 0 when green, 1 when a check fails, 2 on a usage error; `--json` where a program reads
the answer.

- `dialecte rules [<files...>] [--json]` checks the code rules on the syntax tree of the changed files
  (or the files given): exported types outside a `*.types.ts` file, module constants outside a
  `*.constants.ts` file, functions declared as `const`, an `await` inside an argument, plan tags and
  standard citations are errors, and so is a test that takes the system's temporary folder itself as
  its root (`tmpdir()` handed to a call that lists or scans a folder, or given as `root` / `cwd` /
  `scratchRoot`...: other tests and processes share it; `mkdtempSync(join(tmpdir(), '<prefix>-'))`
  gives the test a folder of its own); positional parameters (beyond a leading `query` / `tx`, a
  symmetric pair aside) and abbreviated names are warnings. Without file arguments it records its result
  in the worktree's git folder (`dialecte-rules.json`: when, HEAD, the state hash, the files, the errors
  and warnings), which the hand-over card reads; a run on named files records nothing.
- `dialecte gate [--fast | --full] [--base <ref>] [--no-wait] [--declare <path>]... [--json]` runs the Definition of Done: `--fast` (default) `check`,
  `skills:check` and the tests of the changed files; `--full` adds `build`, the whole suite (niced, one
  file at a time), `doc:build` and `type-bench:check`. Each step runs unfiltered, with
  `GIT_OPTIONAL_LOCKS=0` (a `git status` inside it never takes the index lock), and is judged on its exit
  code and on the counts it printed: a step exiting non-zero fails whatever it says, a test step that
  counts no test fails - except `--fast` on a change that touches no test (a doc edit): the changed-tests
  step passes with the note "no test file is affected by the change". A step whose npm script the package lacks is skipped. While a hand-over
  holds the repository (`dialecte handover <lots.json>` wrote its lock), the gate runs only under the
  hand-over written for this repository - the script the lock names exists and the `lots.json` beside it
  names this repository, real paths compared - and says so in one line with the command that refreshes
  the hand-over once the gate is green (`dialecte handover <lots.json> --rehash`): an author re-gates
  after a late edit without touching the lock. It refuses under a hand-over of another repository, a
  script that is gone, a folder without a lots file, and while a real `handover run` of that folder is
  in progress (its `running.json` names a live process; that refusal names the marker file, in the
  hand-over folder, so a person can tell a pid reused by another process). A refusal names the script and the lock and
  says what to do: run the hand-over first (its last commit releases the lock), or hand the lock's path
  to the person who runs the repository, who decides. A run that reaches its steps records its result in the
  worktree's git folder, `dialecte-gate-fast.json` or `dialecte-gate-full.json`: when it ran, HEAD, the
  state hash and each step (the tdd step first) with its status, its counts and its note or reason, the
  tdd step with the cases of the change it judged (`cases`: label and status); a run refused at the hygiene or at the machine lock records nothing. The state hash is that of the tree the
  worktree would commit (HEAD's tree with the changed and untracked files on top, the deleted ones
  removed, `.dialecte/` left out): committing the lots leaves it the same, any other edit changes it.
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
  `handover run --probe` within 10 s. "This cli" is the script that runs: when it is a temporary one
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
- `dialecte tdd red|green|status [<test file> | <test file>::<case name>]... [--base <ref>] [--no-wait] [--json]` makes
  the order of the work visible: tests written from the spec before any code, red for a real reason, then
  made green by an implementation that did not touch them. The ledger lives in the worktree's git folder,
  never in the tree. Runs use the package's own vitest (each project's run of a case is a case of its own;
  a package whose tests run in a browser takes the machine lock), with snapshots never written
  (`--update=none`, CI): a snapshot test's snapshot is written by the test station before the red.
  - `red` runs every case of the changed test files (or of the files named). A case that fails on an
    assertion (a snapshot mismatch included), on a stub's error (a message starting with
    `not implemented`) or on an error existing code throws, inside an `expect(...)` a matcher completes,
    gets a red. Refused, each with its reason: a passing case that is new or changed ("it ran green: this
    test proves nothing yet"); a passing case with a receipt whose own test call changed; a passing case
    still waiting for its green whose test file, or test code it imports, changed since its red ("test
    code changed since its red and it passes"); a failure on a missing export, a type or syntax error, a
    timeout, a stub thrown at import or before the assertion; a file holding `.only` or `only: true`. A
    case the same as at the base is marked unchanged; a case the lot accepts is marked accepted; a green
    case whose test code changed around it is kept and flagged `test code changed around it` (the next
    step adding a case to a green file); a case never proven green (only unchanged, accepted or revised)
    is kept without a flag, and no receipt. A file with a refusal still records its other cases'
    receipts, the refusals kept as evidence, but is not frozen: the gate fails on it until no case of
    it is refused.
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
    `red after green` when the case's own last receipt is a green at the same production state.
  - The run freezes each test file without a refusal, and a changed helper, fixture or snapshot only when
    a case of a file depending on it went red, or was recorded revised, in that run: what it imports
    (relative, tsconfig `paths` or vite alias, barrels and re-exports followed through test code; a
    package name is a dependency, not test code), a changed file whose name its test code mentions, or
    the text of a production module its test code imports directly (a constant naming a fixture; one hop
    into production, never further, and the module itself is production), its own snapshot. Every
    dependency found by import is followed in turn, and one found by a name written with its folder
    (`fixtures/scan.ts`, a full path): it brings the files it imports (`import type` included). A bare
    file name (`index.ts`) may be another file: the changed file it names is a dependency, not followed. A
    helper no red covers stays unfrozen, and the gate fails on it. An import that looks local (`@/`, `~/`,
    `#`, a `paths` or alias prefix) and resolves nowhere refuses its file, naming the import.
  - `green` runs the changed test files: each case needs a red receipt, its file, its test call and its
    test code as frozen, production changed since its red ("nothing in production changed since red"),
    and a pass.
  - `status` prints each case (red, green, unchanged, accepted, missing receipt, test edited after red,
    with its flags), the test code changed outside `tdd red`, and the cases the change deletes. A test
    call of the base gone without a title (an `it(name, ...)` whose title is a variable: an edited call
    looks deleted) prints `deleted <file> a test call of the base is gone`; when a `gone` entry of
    `.dialecte/lot.json` names its file (a path or a glob), it prints
    `gone <file> a test call of the base is gone (<reason>)` instead, in the gate's details too. A titled
    test gone and a deleted test file stay `deleted`. A ledger that cannot be read is refused with its
    path.
  - `status --flags` prints only the cases whose receipts carry a flag, with their flags.
  - `status --legend` prints the tdd terms of the hand-over card, each in two lines: what it means, and
    whether to look. It needs no package: it works from any folder.
  - The lot is the uncommitted work: the change is measured from HEAD, so the cases of lots already
    committed on the branch are not asked again. `--base <ref>` (`tdd` and `gate`) gives the
    whole-branch view; `gate --full` measures from where the branch left its base branch.
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
    still needs a red; a case whose title the file computes and the base does not write is refused
    ("not provably a case of the base: accept it or prove it red"). The `case` may also be a file path or
    a glob over file paths (`scripts/**/*.test.ts`: `**` any folders, `*` and `?` within one), relative
    to the package root, without `::`: it applies to every case of the matching files, with one reason.
    A file or glob entry never covers a case whose last proof is a red still waiting for its green, and
    keeps the `red after green` flag of a case made red again; an exact entry covers both. An `accept`
    entry stays one exact case. The next `tdd red` records it as revised when it passes (a
    red when it fails) and freezes its file and the changed test code it depends on. Without that red
    run the gate fails on the edit; the gate, `status` and the hand-over card list the revisions with
    their reason, an entry (exact, file or glob) no revised case used as a note.
  - What it cannot see: the receipts can be written by an agent with a shell; a deliberate throw in
    production looks like a stub; code written first, hidden, then a red taken at the base state, cannot
    be told from an honest red (at the first step the red's production is the base's). The flags and the
    refusals make the rest visible; the review reads the diff.
- `dialecte new verb <namespace> <query|transaction> <name> [--version <v>]` writes a verb of a dialecte
  package in the house style: the function (query or transaction first, one params object), its
  `.types.ts`, a table-driven test with one red case (no `only`: `tdd red` refuses a focus marker; while
  iterating, run the case with `npx vitest run <file> -t "<case>"`), its barrel export and, for a new
  namespace, the namespace module and its registration. Its JSDoc summary and `@intent` start with
  `FILL:`, which `skills check` refuses until written; the command prints every placeholder left.
- `dialecte handover <lots.json> [--out <dir>] [--rehash] [--json]` prepares the commit-by-lots
  hand-over a human runs. The lots file names the repository, the branch and HEAD expected, and the lots
  (paths, message):

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
  file is in no lot or in two, or a lot file (evals included) or message holds a plan tag or a standard
  citation. Otherwise it writes the hand-over folder - the lots file, the snapshot (`files.txt`,
  `files.sha256`, `files.deleted`, and `lots.sha256`: the lots file as reviewed) and a one-line
  `commit.sh` that runs
  `npx --no-install @dialecte/cli handover run <folder>` (bash, also run with `sh`; when the repository
  installs no cli that can, it says so in one line with the fix) - and prints the hand-over card, the
  command with its absolute `cd` under it. `--json` answers the card as data: the verdict, `failedGates`,
  `otherTreeGates`, `declarations` (the entries to read), `gates` (the gate lines: name, status, detail),
  `tdd` (the tdd lines as the text a person reads, no layout and no padding), `notes`, and each lot with
  `pending` until it is committed. Edited a file after the review? `--rehash` (also after
  editing `lots.json`). The repository stays held until every lot is committed: `dialecte gate` runs
  only under this hand-over (see `gate`), and a hand-over of another folder is refused, naming the script
  that holds the repository and its lock.

- The hand-over card is what a person reads before running the hand-over, and again at its end. Its title
  is `hand-over: <repository folder> <branch>`; the repository and worktree paths are not in it. Its
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
    `--full` and the commit hook's record, a line of the hook's ending with `commit hook`:
    `✓ test:run  1214/1214 · commit hook`; a gate record newer than the hook's replaces its lines whole,
    since the hook names its own scripts, not the gate's steps), then `rules` from its record, then
    `review` from the hand-over folder's findings ledger and `round-<n>/` snapshots. `✓` passed; `!` to
    look at (a step not run here, with its reason, or not run after a failure; `rules` never run; no
    findings ledger, or one holding no row yet: `no findings recorded`; only nits open); `✗` failed (a
    failed step,
    a rules error, a blocking or should-fix finding open, `gate  never run on this tree` when there is no
    record). A record of another tree than the worktree's now ends with `(the tree changed since)`: its
    line turns `!` and blocks the hand-over; a failed step stays `✗`.
  - `tdd`: the lot's exemption; only the cases of the change count, those the gate's tdd step listed on
    this tree (a retitled or removed case's receipts are not counted under the old title); without a gate
    record of this tree that lists them, one line `counts from the last gate: run the gate on this tree`
    replaces the counts, groups, entries and flags; each case counted once by the status the gate gave
    it (red then green as proven, kept when its last receipt is a kept after a green; accepted and
    revised only in their groups)
    (`<n> proven red → green · <m> unchanged`, and `· <k> kept` when any); the accepted cases: a head
    line `<n> accepted`, then one row per reason of the lot file (`<count>  <reason>`, the largest group
    first, a tie in the lot file's order, each reason wrapped under itself); the accepted and revised receipts
    of earlier lots, which the lot file no longer names, on one line
    (`earlier lots: 410 accepted, 12 revised (not in the lot file)`); then
    `<n> revised · <m> gone · <k> unused` with `to read ↓` at its right edge and one entry each: a revised case `<file> › <title>` (named by the lot file exactly, or by a file or glob entry)
    with its reason under it, a `gone` entry with its reason (whether one covers a finding is the gate's
    to say), an `accept` or `revised` entry no case used. Then one line per kind of flag with its count of
    cases (`dialecte tdd status --flags` lists them); cases whose only flag is `test code changed around it`
    and whose receipts are otherwise only unchanged are counted apart (a case flagged rollback or red after
    green never is), as
    `helper code changed near unchanged cases (noise)`.
  - `notes`: the lots file's `gates` text, as written; only on the cards printed before a run (the
    written card, a rehearsal's), never on the card after a real run.

  Its closing rule reads `dialecte handover --legend · details: dialecte tdd status` (in a box too narrow
  for it, that text is printed inside, above a plain closing rule). The command stays
  under the box until every lot is committed. `dialecte handover --legend` prints every term the card can
  print, each in two lines: what it means, and whether to look.

- `dialecte handover run <folder>` is what `commit.sh` runs. Each guard prints one line with its result
  and its time (`✓ snapshot    110 file(s)  0.4 s`): repository, the lots file as reviewed, hooks
  folder, branch, HEAD, empty index, the files against the snapshot, deleted files, files outside the
  lots, plan tags and citations. When the staged files are exactly the next lot's (a run stopped after
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
  and the log's path. A hook that ended (passed or failed; not one stopped as stalled) is recorded in
  the git folder of the repository it committed in (`dialecte-gate-hook.json`, mode `hook`): HEAD after
  it (the new commit, or the base when it failed), the state hash of the tree before the commit and the
  steps its summary names with their status and counts; the card reads it with the gate records, so a
  lot committed where no `dialecte gate` ran still shows its gates, until a newer gate record replaces
  it. A rehearsal records in its scratch clone only. A hook that prints nothing gets `hook ✓` (or
  `hook ✗`) and the log's path; a repository with no commit hook prints none of it (in husky's `.husky/_`,
  which holds a wrapper for every hook name, a hook counts only when its script exists in `.husky/`). Then the commit with
  its stat; the total time and the card at the end. A lot whose `git add` or commit fails is unstaged again: once the cause is fixed, the same command
  finds the lots already committed on top of the recorded HEAD (same message, same paths, same content)
  and resumes at the next one; anything else on top of HEAD is refused with what was found. It never
  pushes. `--rehearse` announces the clone (`▶ rehearsal clone`), warns naming the untracked files outside
  `.gitignore` and `.git/info/exclude` a hook could read (they are not in the clone), and runs the lots in a scratch clone that looks like your tree - the repository at
  HEAD, your working tree on top, the hooks folder, a copy-on-write copy of `node_modules` - so the hooks
  run as they will for real. The clone sits in a rehearsal folder under a short root, `/tmp` on macOS
  and Linux (the system's temporary folder on Windows):
  `/tmp/dialecte-rehearse-<random>/<repository folder name>`, so a tool's socket under the hook's
  temporary folder stays within the system's path limit; the hook runs with `TMPDIR` set to a folder
  inside the rehearsal folder. Beside the clone, a link per relative `file:` / `link:` dependency of the
  repository's package.json that leaves the repository, to the folder the same path reaches from the
  repository (`file:../core`: `<rehearsal folder>/core` -> the repository's `../core`), so the clone
  resolves it as the checkout does; one line names the links, and a path that leaves the rehearsal
  folder too, or whose target is missing, is not linked (a line says why). The whole rehearsal folder is
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
  `--rehearse` prints the merge's `tree <sha>`, which goes into the lot as `tree`; a real run requires it
  ("tree not recorded: rehearse first"). Before merging, the run refuses the lot when HEAD's tree is
  not its `onTree` - an earlier lot committed other content (a hook staged files of its own) - naming
  both trees, with nothing merged, and the next step (see what the lots before it committed, then write
  the hand-over again from this HEAD for the lots left). A `merges.json` without `onTree` (written by an
  earlier cli) is refused at the read: write the hand-over again, then `--rehash` after a review. The run merges the recorded tip (`git merge --no-ff
--no-commit`; a branch moved since is a note) and refuses a merge in progress, leaving it - except one
  of the lot's own tip that this cli started (its marker in the git folder) or with `--resume-merge`,
  aborted and redone. It checks the conflicts against the recorded ones, copies the resolutions
  (hash-checked), refuses conflict markers in the result, and checks the staged tree against the recorded
  one before the commit (else the merge is aborted) and the commit's tree after it (a hook may stage
  files). A merge whose hook refuses it is aborted, for a clean rerun. A rerun recognises a done merge by
  its subject, the tip as its second parent and its tree. Before any commit whose staged
  `package-lock.json` differs from HEAD's, `node_modules` are brought to it: the staged lock and
  `package.json` written over the working copies (the working ones saved first in the git folder's
  `dialecte-install-backup`, put back after the install, on an interrupt too; a backup a crash left is
  restored by the next run when the files still hold the staged bytes, else refused naming it),
  `npm ci --ignore-scripts --prefer-offline --no-audit --no-fund` (no install script runs: a `prepare`
  or `postinstall` could change git config, hooks or any file; `npm ci` reinstalls every package, so
  the note after the sync names each installed package of the staged lock that has one,
  `install scripts not run: <names>`: each package once by its name, a nested copy too, five named then
  `and <n> more`), the working copies put back
  byte for byte;
  refused when the install changed the staged files or the versions still differ (dev, peer and optional
  packages an install leaves out aside). A real run that leaves every lot committed then moves the worktree's `.dialecte/lot.json`
  into the hand-over folder as `lot.json`, after the card is built, and leaves an empty declaration
  (`{}`) in its place, saying so in one line (`lot file archived: <folder>/lot.json`): the next lot on
  the branch does not inherit its entries. No lot file, an empty one, a rehearsal, a stopped run, or a
  folder that holds a `lot.json` already (a second run) leave the lot file as it is.
- `dialecte handover list [--root <dir>] [--json]` lists every hand-over folder under the workspace's
  `_commit-plan/` (or the folder given, or the current one): repository, worktree, branch, lots, age, and
  its state - pending, partly committed, committed, or stale when something else moved the branch. A
  folder holding a hand-written `commit*.sh` and no lots file shows as "legacy script, state unknown".
- `dialecte worktree add <repository> <branch> [--from <ref>] [--json]` makes a worktree under the
  workspace's `.worktrees/<repository>-<branch tail>` (the last segment of the branch: `core-depth` for
  `feat/depth`; a new branch starts from `--from`, else the base
  branch): it copies the hooks folder `core.hooksPath` names (husky's `.husky/_` is ignored by git, so a
  plain worktree misses it), copies the main checkout's `node_modules` copy-on-write where the file system
  can (links kept, a relative link to a sibling re-pointed so it still reaches it) - from the worktree that
  has the `--from` branch checked out when it has one, else from the main checkout - lists `.dialecte/`
  once in the exclude file of the repository's common git folder (so for the main checkout and every
  worktree of it), and writes the hygiene baseline `gate --fast` compares with; it prints a card.
  Before the copy it makes the links the worktree's `file:` and `link:` dependencies need (`dependencies`,
  `devDependencies`, `optionalDependencies`, `peerDependencies`): a relative path that leaves the worktree
  into the workspace's `.worktrees/` (`file:../core` from `.worktrees/cli-x` reaches `.worktrees/core`)
  gets a relative link there to the folder the same path reaches from the main checkout
  (`.worktrees/core -> ../core`). Each dependency gets one outcome, in the card's `links` row and the
  JSON's `siblingLinks` (`dependency`, `link`, `target`, `outcome`): `created`; `present` (a link that
  already reaches it: a second worktree changes nothing); `skipped: <target> missing`;
  `skipped: <folder> missing` for a path into a sibling whose own folder is not under `.worktrees/` yet
  (`file:../core/sub/pkg` without `.worktrees/core`); `skipped: outside .worktrees/`;
  `skipped: cannot make the link (<code>)` when the file system refuses it (`EACCES`, ...);
  `kept: points to <its text>, not <target>` or `kept: a real folder` (or file): what is there is never
  replaced. A path inside the repository needs no link and is not listed. After the copy it reads
  `node_modules` against the worktree's `package-lock.json` (its `packages` map, lockfileVersion 2 or 3,
  nested packages included, bundled ones left out): each package installed at its locked version
  (`missing`, `<installed> installed, lock <locked>`, `package.json unreadable`), each link reaching what
  the lockfile resolves it to (`link to <path> missing`, `… points elsewhere`). A package npm may leave
  out of this machine's install is not missing when absent: `optional`, or an `os` / `cpu` list this
  platform does not match (`!x` excluding x); a `devOptional` one is, since a development install puts it
  in. The card's `lockfile` row says
  `✓ node_modules matches package-lock.json (<n> packages)`, or the count of packages that differ with the
  first five, and a `next` row holds the command that puts it right, `cd '<worktree>' && npm ci`. Without
  a lockfile it says `no package-lock.json: not checked`; a lockfile that is not JSON, or has no `packages`
  map (lockfileVersion 1), is not checked either (`package-lock.json unreadable: not checked`,
  `package-lock.json has no packages map: not checked`). The JSON carries it as `nodeModulesCheck`
  (`lockfile`, `notChecked`, `problems`: `package`, `problem`; `command` when there are problems). The
  exit code stays 0 whatever the links and the lockfile say: the worktree exists, and its card says what
  to run.
- `dialecte lot exempt <reason>`, `lot accept <case> <reason>`, `lot revised <case|file|glob> <reason>`,
  `lot gone <file|glob> <reason>` write the lot declaration `.dialecte/lot.json` at the package root (the
  nearest package.json above the current folder) as tab-indented JSON, keeping what it holds; the same
  case (or file) again replaces its reason. `accept` needs a case `<file>::<name>`; `gone` refuses one
  (it writes `"gone": [{ "file": "<file or glob>", "reason": "..." }]`).
- `dialecte worktree prune [--root <workspace>] [--yes] [--json]` lists, per repository of the workspace,
  the worktrees and local branches whose commits are all in the base branch, the hand-over folders whose
  lots are all committed (never `_commit-plan` itself, nor a folder holding other folders) and the
  rehearsals whose process is gone - the rehearsal folders under `/tmp` (each goes whole) and the clones
  earlier cli versions made in the system's temporary folder, each judged by its marker - with the
  command that removes each (its absolute `cd` first).
  `--yes` runs them after a confirmation on a terminal; without a terminal it refuses, so hand the
  commands (or the `--yes` command) to a person. Kept, each with why: an unmerged branch; the branch the
  main checkout is on; a worktree a hand-over is pending in, or with uncommitted changes; a branch whose
  reflog still reaches commits the base does not hold (reset onto a newer base after commits of its own:
  its reflog is the only way back to them); a worktree or branch with no commit of its own in its reflog
  (just made); a worktree holding ignored files that removing it would delete (anything but
  `node_modules`, `dist`, `.vitepress/cache`, `.vitepress/dist`, `.DS_Store` and the hooks folder; a long
  list is counted, the first three named); a rehearsal clone whose process still runs, or without a
  marker. It never removes, nor offers to remove, a symbolic link or what a link reaches. A worktree
  path, a hand-over folder or a rehearsal clone that is a link, or a hand-over folder reached through a
  linked folder under the workspace at any depth, is kept with
  `a link: prune never removes a link nor what it points to` (a dangling link included). A worktree,
  hand-over folder or rehearsal clone that a link reaches (links looked for one level under the
  workspace, its `.worktrees/`, its `_commit-plan/` and the scratch folder) is kept with
  `the link <link> points to it`. `git worktree prune` unregisters every worktree whose folder holds no
  checkout, a link's too: while a registered worktree of the repository is a link, a worktree deleted
  from disk is kept, naming that link, and no `git worktree prune` is offered. The sibling links
  `worktree add` makes (`.worktrees/core -> ../core`) are in no item. It reads each worktree with
  `git --no-optional-locks`, so it never rewrites an index. `handover list` follows a link to a hand-over
  folder and lists a folder reached by its path and through a link once.
- `dialecte record review|decision|snapshot` and `dialecte review delta` keep a lot's review rounds in its
  hand-over folder (`_commit-plan/<topic>-<date>/`), which stays outside every repository: each refuses a
  folder inside a git work tree or a git folder (`.git/`, a bare repository). `--` ends the options: the
  words after it are taken as they are, so a finding or a reason may start with `--`.
  - `record review <folder> --round <n> --severity <blocking|should-fix|nit> --at <file:line> <finding>`
    appends the row `| R<n>-<k> | <n> | <severity> | <file:line> | <finding> | open |` to
    `<folder>/findings-ledger.md` (the folder, the file and its table made when absent; k one past the
    highest of the round). A `|` is written `\|`; a line break is refused. A hand-written ledger keeps
    every other byte.
  - `record decision <folder> <id> <state>` rewrites that row's state cell: `open`, `fix-to-verify`,
    `fixed <round> [note]` (a round after the one that raised it), `accepted <reason>`, `logged <where>`.
    An id not in the ledger is refused, naming the ids it holds.
  - `record choice <folder> --by <who> <decision>` appends `| <decision> | <who> | <yyyy-mm-dd> |` to
    `<folder>/decisions.md` (made with its title and table when absent): a decision made outside the
    findings ledger, the user's above all. A `|` is written `\|`; an empty `--by`, a line break, or more
    than one decision word (quote it) is refused.
  - `record snapshot <folder> --round <n>` copies every file `git status --porcelain -z
--untracked-files=all` lists at the worktree root (the old path of a rename included) to
    `round-<n>/` at its repository-relative path - bytes, mode, a symlink as a symlink; a path gone from
    disk (or now a folder) that HEAD holds goes in `round-<n>.deleted`, NUL-separated, sorted; HEAD in
    `round-<n>.base`. An existing round, an untracked nested repository and a submodule (a gitlink in the
    index or at HEAD) are refused; a run that
    stops part-way leaves only `.partial` names, which the next run removes. `.dialecte/lot.json` is
    never part of it.
  - `review delta <folder> --round <n> [--worktree] [--json]` (n ≥ 2) prints, for each file of
    `round-<n-1>/`, of `round-<n-1>.deleted` or of the worktree's status, what changed since round n-1,
    in the form that fits where the file is: the snapshot copy against the worktree file (or
    `/dev/null` when it is gone), `/dev/null` against a file deleted then and back now or new and absent
    from the base, `git diff HEAD` for a file round n-1 had at the base. Files unchanged since round n-1
    are left out; colour, external diff and textconv settings never apply. It refuses when HEAD moved
    since `round-<n-1>.base`, and refuses a nested repository or a submodule as `record snapshot` does. `--worktree` adds a throwaway worktree on the branch
    `<lot branch>-round-<n-1>` from the lot's branch tip: the deletions applied with `git rm
--pathspec-from-file`, then `round-<n-1>/` copied over, so a new test can run on the old code; it
    prints its path and the removal command with its absolute `cd`. The lot's worktree is never
    changed.

`gate --fast` starts with the hygiene of the worktree: nothing staged; no stash entry pushed on this
worktree's branch since `worktree add` made it (the baseline keeps every stash entry it saw, so another
session dropping one changes nothing; one stash is shared by every worktree and session: a new entry of
another branch is only noted, naming it; without a baseline the stash is not compared); and
every new file one the change declares (`--declare <path>`, repeatable; an undeclared one is a warning).
A failure says what changed and how to look at it with read-only commands. `gate --full`, and every
heavy step, hold a machine-wide lock in your cache folder (`$DIALECTE_CACHE_DIR` overrides it) naming
its holder. A step is heavy when it says so (`"heavy": true` / `false`); else when its command names a
browser project (`--browser`, a `--project` named browser, playwright); else when the package runs its
tests in a browser (it depends on `@vitest/browser*` or playwright, or its vitest / vite config declares
a `browser`) and the step is a test step (it counts tests, or runs vitest or playwright). Another heavy
run waits with a line every 30 s naming the holder, or refuses with `--no-wait`. A lock whose process is
gone, or whose pid now belongs to a process started at another time (read in the C locale and UTC, so
two shells with other languages or time zones agree; a `ps` that answers nothing never makes a holder
look dead), is taken over under a short takeover lock (`<lock>.takeover`), so only one caller replaces
it. A lock file still being written is left alone; one that stays unreadable, or a takeover lock, is
cleared once it is a few seconds old.

`dialecte lock run [--no-wait] -- <command> [<argument>...]` runs any other heavy command (a mutation
run, a browser suite) under the same lock: it takes it as `dialecte lock run -- <command words>`,
waiting with the same line every 30 s or refusing at once with `--no-wait` (exit 1, naming the holder),
runs the command without a shell, its output on the terminal, in the environment the cli was given
(git's repository variables, which the cli clears for its own git commands, included), and releases the
lock when the command ends. It exits with the command's code: 128 + the signal's number when a signal
ended it, 127 when the command is not found, 126 when it is found but cannot be run (not executable).
While the command runs, Ctrl-C (an interrupt or a termination sent to the process group) reaches the
command and `lock run` waits for it; a termination sent to `lock run` alone is passed on to the command.
Node cannot tell the two terminations apart, so a termination sent to the whole group reaches the
command twice. A `lock run` itself killed (SIGKILL, or SIGHUP when its terminal closes) leaves its lock
behind while the command may still run: the next caller finds its pid gone and takes the lock over. The
command runs with `DIALECTE_MACHINE_LOCK_HOLDER` naming the holder as `<pid>:<process start>`: a `gate`,
`tdd` or `lock run` inside it finds the lock held by that live process (the pid and its start both
matching, so a reused pid does not when the process start is known; with no start recorded, `<pid>:`
matches the pid alone) and takes it at once, its release leaving the lock to the holder
(`dialecte lock run -- npx dialecte gate --full` does not wait on itself; a third level names the same
holder). `gate` and `tdd` do the same for what they run while they hold the lock: a heavy gate step, a
browser package's vitest runs, and under `gate --full` (which holds the lock for its whole run) every
step and the tdd step get `DIALECTE_MACHINE_LOCK_HOLDER` naming the holder, so a `dialecte lock run`
inside them runs at once. `-h` and `--help` after `--` belong to the command (the help is read only before `--`, for every
command). No command after `--`, or another subcommand than `run`, is a usage error (exit 2).

`gate --fast` and `--full` run a `tdd` step after the hygiene (first in `--full`): every test-code file
changed since the base (test files, helpers, fixtures, snapshots) must be as the red run that last froze it
("test code changed outside tdd red"), and every case of the change red then green, or unchanged; the
others fail the gate with the list. The flags of the receipts and the deleted cases are printed under the
step. The lot file may also accept cases without a red - a new test of behaviour that already exists, an honest
cut of an assertion: `"accept": [{ "case": "<file>::<name> [project]", "reason": "..." }]`. An accepted
case passes `tdd red` as accepted and does not block its file; the gate lists each acceptance with its
reason, the hand-over card counts them by reason from the receipts (those of earlier lots, which the file
no longer names, counted on one line), and both report an acceptance or a `revised` entry no case used. The card
lists every `gone` entry with its reason; only the gate reports a `gone` entry that covers no finding. The file is strict: an unknown key, at the top or in
an `accept` entry, and an exemption without a reason are refused, naming what is wrong. A lot the orchestrator declares exempt - a wording, rename or doc-only lot - passes with its reason
and what the change touches: `{ "tdd": "exempt: <reason>" }` in `.dialecte/lot.json` at the package root
prints "exempt: <reason> (n production file(s), m test file(s) changed)". The hygiene and the hand-over
leave the file out (never committed); the hand-over card shows the exemption and the flags. A package that
does not test with vitest skips the step; a node-only package's step never takes the machine lock.

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
	"generatedDocs": [".vitepress/data/elements-catalog.json"],
	"referencePatterns": ["SPEC-[0-9]+"],
	"baseBranch": "main"
}
```

`gate.fast` / `gate.full` replace the default steps of that mode (`counts: "tests"` makes a step fail
when it counts no test; `changedOnly: true` marks a step that runs only the tests the change affects,
so "No test files found" passes with a note instead of failing; `restoresGeneratedDocs: true` restores the `generatedDocs` byte for byte after
it; `heavy: true` / `false` says whether the step takes the machine lock); `baseBranch` is the branch
`worktree add` starts from and `worktree prune` compares with (default `main`); `referencePatterns` adds the package's own patterns (extended regular expressions) to the plan
tags and citations `rules` and `handover` refuse.

### GitHub text: recap and text check

Text written with an assistant tends to retell the diff and grow long. The pull request splits in two:
an expandable part made from records, and a short human part that is checked before it is posted. Both
commands only print; the user posts.

- `dialecte recap <hand-over folder>` prints the expandable part (`<details>`) as GitHub markdown, from the
  records only: the commits of the lots (or `not committed yet`), the test cases the newest gate record of the
  current tree judged red then green, counted per test file, the gate and rules lines, the review rounds from
  the findings ledger, the decisions (accepted findings, the lot declaration's `accept` and `revised` entries,
  the rows of `decisions.md`), the logged findings as follow-ups, and who reviewed and posted it (`git config
user.name`; no name set is refused). Every section is always there, saying so in one line when empty; a
  branch that does not hold the lots on top of the recorded base lists none as committed and says so. Each
  finding is printed with its id, its text without one leading reviewer tag `[...]`. The ledger is read whole:
  every row after its header with the header's cell count is a finding, whatever its id (`R<n>-<k>`, `TR3-1`,
  `F-a`, printed as written), notes between rounds included; its round is the round cell's, else the one an
  `R<n>-` id names, else the row is refused. A state is read as a history (`fix wrong 2 (...) - fixed 3
(reasoned)`): it starts with `fixed`, `accepted`, `logged`, `open`, `fix to verify`, `fix wrong` or
  `reopened`, and a spaced dash starts a new part only before `fixed <n>`, `reopened <n> by <id>`, `fix wrong
<n>`, `fix to verify`, a closing `open`, or a later `accepted` or `logged` followed by ` (`, `: ` or a
  spaced dash; any other spaced dash belongs to the text before it. The last part decides (`fix wrong`,
  `reopened` and `fix to verify` leave the finding open), an accepted one's reason being the rest (in its
  parentheses, or after `- ` / `: `); a state recap cannot read is refused with the row's id. A `file:line` is
  printed relative to the repository, or to the workspace folder for a sibling repository (the parent of the
  main checkout; of the `.worktrees` folder when the repository is gone), never absolute: an absolute path
  outside both, or one the rewrite does not reach (a `/` starting a path segment after a backtick, a quote,
  `=`, `[`, `-`; `~/`), is refused with the row's id; a `/` starting no segment (`a.ts / b.ts`, `+/- 2`) and
  URLs stay. Where a finding was logged, the hand-over folder and the lots file's notes are left out. It writes
  nothing.
- `dialecte text check <file> [--kind pr|issue|comment|commit]` checks every line before the first `<details`
  line (the recap is not checked). A pull request or an issue holds the headings `What changes`, `Why`, `How
to check it` in this order, then `Watch out` only when it has something to say; each with text under it,
  nothing before the first. A comment or a commit holds no heading; a commit's line 1 is its subject, not
  empty and at most 72 characters (longer ones are cut in logs and in GitHub's list), with a blank line before
  the body. The word cap: 150 for a pull request (the diff carries the rest), 200 for an issue (it stands
  alone), 80 for a comment (it answers one point), 100 for a commit body (the why; the subject is not
  counted). Words hold a letter or a digit; headings and fenced code blocks are not counted. Past the cap it
  prints the count, the cap and every line from the one that passed it. Exit 0 when the text holds, 1 with one
  line per problem.

## Run a script

`dialecte run <script.ts>` runs a script against an in-memory project of the dialecte your project
installs (with `@dialecte/core` 0.8.0 or later) and answers one structured outcome. The script is a
module whose default export receives `{ project, doc, documentId, dialecte, helpers, utils }`; what it
returns is the outcome's `result`.

```ts
// add-part.ts
export default async function addPart({ doc }) {
	const [assembly] = await doc.query.findByAttributes({
		tagName: 'Assembly',
		attributes: { name: 'A1' },
	})
	await doc.transaction(async (tx) =>
		tx.addChild(assembly, { tagName: 'Part', attributes: { name: 'P2' } }),
	)
}
```

```
dialecte run add-part.ts --in assembly.xml --expect expected.json
failed: expectations not met
operations: Assembly +0 ~1 -0, Part +1 ~0 -0
diagnostics: none
expectations: 0 passed, 1 failed
  ✗ expected 3 Part under Assembly[name="A1"], found 2
```

- `--in <file>` imports a file first (an empty document otherwise); its import diagnostics are in the
  outcome. `--out <file>` writes the document once the script ran.
- `--prepare` stages the script's first transaction instead of committing it and stops the script
  there: the records it would write, and what its callback returned (a lifecycle report), nothing
  committed. Any other write is refused and fails the run, even when the script catches the refusal:
  a second transaction, `commit()` on a prepared transaction, a transaction on a document opened
  through `project.openDocument`, the project's own writes (`importFile`, `removeDocument`,
  `undo`, ...) and its raw database (`getDatabaseInstance`). In every mode the runner alone commits:
  `tx.commit`, `tx.finishStaging` and `tx.clearStagedOperations` are refused inside a callback, and a
  transaction nested in another fails with `CONCURRENT_TRANSACTION`. The guarantee covers the API a
  script is handed; a deliberate call around it (`Object.getPrototypeOf(doc).transaction.call(...)`, a
  store reached by other means) is outside it.
- `--expect <file>`: a JSON array of expectations `{ "tag", "where"?, "under"?, "count"? }`, checked on
  the result (on the staged transaction under `--prepare`); each one not met is named with the count
  found. `count: 0` means none, no `count` at least one.
- Deterministic: ids come from a seeded generator (`--seed <n>`, 0 by default), `--now <iso>` freezes
  the clock, both from the moment the script module loads (an id minted at its top level is seeded
  too). The same script, input and seed give the same outcome.
- Operations are counted per record, as each commit merges them: an element created then updated in
  one transaction is one creation.
- A thrown structured error is answered as code, key, detail, `meta` and the element's path from the
  root (`/Root/A/AA_2[2]`); `dialecte explain <code>` says what it means.
- `--json` prints the outcome as data. `--package <name>` names the dialecte when the project depends
  on none or several (`@dialecte/scl/v2019C1`, `@dialecte/core/test`). `--timeout <ms>` (120 s by
  default): the run then answers a timeout and the command exits; called as a library, the script may
  keep running in the caller's process. Exit 0 ok, 1 failed or an expectation not met, 2 usage. The
  script's own console output goes to stderr. A value the script returns that is not JSON (a cycle, a
  BigInt) is given as text with a note.
- Needs Node 22.18 or later: a `.ts` script runs through Node's built-in type stripping, no build step
  (erasable TypeScript only: types, no enums or namespaces).

`dialecte explain <code | key>` reads the error catalogue of the installed core and the error and
diagnostic catalogues the dialecte exports: the message, when it is raised, the usual fix, the docs
page. `--json` for the entries as data; exit 1 when no catalogue knows the code.

## A fixture from the engine

`dialecte fixture <Tag>` answers the smallest XML document holding `<Tag>` that is valid against the
dialecte's full schema, built by the engine of the dialecte your project installs - never written by hand.
It is a `dialecte run` of a script the command writes from the definition, read through core's readers:

- the chain of parents from the root down to the element: the shortest one (among chains as short, the
  first in sequence order), or the one `--under A/B` names (the root may be named first or left out);
- every child an element on the way requires, as many times as it is required, and the first branch of
  each choice it requires (unless a child already takes one), each with what it requires in turn; an
  element declared with an abstract type names its first variant with `xsi:type`;
- a value for every required attribute, and text for an element whose type an empty text does not
  satisfy: the fixed value, else the default, else the first value the type takes - an enumerated value,
  a string its patterns match, a number counting up from the lowest its range allows, free text from the
  tag name - checked against every facet (enumeration, pattern, length, range). Each sampled value is new
  in the document, so unique and key fields never repeat one;
- every element a key selects holds its key fields, and every reference a keyref checks points at an
  element of the key: one already planned when the values can meet (the element itself, for a reference to
  its own key), else one planted along the key's selector, with what it requires in turn (its own
  references included).

```
dialecte fixture AAA_1 --package @dialecte/core/test
<?xml version="1.0" encoding="UTF-8"?>
<Root xmlns="http://dialecte.dev/XML/DEFAULT">
    <A aA="A">
        <AA_1 aAA_1="AA_1">
            <AAA_1 aAAA_1="aaa">
                <AAAA_1 aAAAA_1="AAAA_1"/>
            </AAA_1>
        </AA_1>
    </A>
</Root>
```

What is guaranteed, and how it is proven: the document is valid against the dialecte's full XSD -
structure, values, identity (unique and key) and references (keyref). The tests build the fixture of every
element of core's test dialecte and of scl and judge each with `xmllint --schema` on the real XSD.

What is not:

- The hooks have the last word on what they fill: an attribute a hook already set when the element was
  added (an id, a derived name) keeps the hook's value. A dialecte whose hooks fill a key or reference
  field differently from the plan could break a reference the plan made good; the tests catch it for the
  dialectes they cover.
- Only the first branch of a required choice, and the first variant of an abstract type, are taken; the
  fixture holds no optional content.
- A reference whose key is declared on another element than the keyref, a key reached only through `.//`
  or through any element, and a field reaching past the selected element are not planted: the command
  exits 1 naming the constraint, never with a document that breaks it.
- The document carries no record-id marks (`dev:db-id`): it is the plain export, as a user would get it.

- Ids are seeded and the clock is frozen: the same command and the same installed versions give the same
  bytes.
- `--out <file>` writes the document and prints one line (the path of the element, the bytes); `--json`
  answers `{ ok, packageName, tag, path, bytes, xml }` (`out` in place of `xml` with `--out`).
- Exit 1 with the reason when there is no fixture: an unknown tag (the closest tags named), a `--under`
  step its parent does not hold, an element only an endless chain of required children could hold, a
  value the fixture cannot make (the attribute named: a pattern construct it does not read, facets no
  value satisfies), a reference it cannot plant (the constraint named), or a write the engine refuses
  (its outcome, as `dialecte run` prints it). Exit 2: usage.
- The command does not run a schema validator itself: no XSD ships with it.

## Developing the cli

The `schema`, `run`, `fixture` and `explain` tests drive `@dialecte/core`'s own test dialecte: they resolve core from the
`@dialecte/core` devDependency, or from the built core checkout `DIALECTE_CORE_DIR` names
(`DIALECTE_CORE_DIR=../core npm run test:run`); with neither they fail.

While the cli follows core's 0.8 train, the devDependency is `"@dialecte/core": "file:../core"`, and the lockfile
holds it: the cli's checkout sits next to core's (`Dialecte/cli` and `Dialecte/core`), and a worktree under
`Dialecte/.worktrees/` reaches it through the link `Dialecte/.worktrees/core` → `../core`, which
`dialecte worktree add` makes (its card says `npm ci` when the copied `node_modules` differs from the
lockfile). Build core there (`npm run build`) before running the tests. A release pins a published core again: `prepublishOnly` runs
`src/release-check.ts` before the build, which refuses a package.json naming any dependency by a local folder
(`file:`, `link:`, `git+file:`, a bare `../x`, `./x`, `/x` or `~/x` path) in `dependencies`, `devDependencies`, `peerDependencies` or `optionalDependencies`, one line
per dependency (its field, name and spec), and says how to pin it
(`npm install --save-exact <name>@<version>`).

The cli has a commit hook: `.husky/pre-commit` runs `npm run check`, then `npm run build`. `npm install` in the
cli checkout activates it (`"prepare": "husky"` sets `core.hooksPath` to `.husky/_`), and `dialecte worktree add`
copies `.husky/_` into each new worktree, so `handover run` proves a cli lot again at its commit. A hook
runs with git's `GIT_DIR`, `GIT_INDEX_FILE` and the commit's identity set: the suite's setup file
(`test/git-environment.setup.ts`, vitest `setupFiles`) clears them before any test, so a test's git acts on
its scratch repository only, and the cli clears git's repository variables at its start.

The suite leaves no temporary folder behind: every test removes what it makes in its own teardown, also
when it fails. A vitest global setup (`test/suite-guard/temp-folder-guard.setup.ts`, `globalSetup`) gives
the run one short folder of its own (`dlt-<random>` under the system's temporary folder) and sets it as
`TMPDIR` for the workers and the commands they spawn; at the end any entry left in it fails the run,
named (ten, then `and <n> more`; Node's compile cache is not one), and the folder is removed whatever
the outcome.

The cli does not re-declare core's types: the definition, record, diagnostic, error, expectation and reader shapes
(`ResolvedDefinition`, `DataType`, `AttributeDefinition`, `AnyDialecteConfig`, `ChildOccurrences`, `Diagnostic`,
`DialecteError`, `Expectation`, the readers of `@dialecte/core/utils`...) are `import type` from the `@dialecte/core`
devDependency, which is erased from the build (the bin loads at run time the core each dialecte resolves, and
`isCoreReaders` checks it holds the readers). Types the cli narrows, because a
dialecte may run on an older core: the config found by shape (`isDialecteConfig` checks `rootElementName` and
`definition` only, typed as `AnyDialecteConfig`), `CoreReaders` (typed from the core the cli is built against;
`isCoreReaders` and the `requiredChoices` check report a reader an older core lacks), and `ElementDef` in
`coverage` (every member optional). What `run` reads of a project and a document (`RunProject`, `RunDocument`,
`RunQuery`) names only the members the runner calls.

`@dialecte/cli/lookups` (`src/lookups.ts`, built with declaration files) is the library entry of the lookup
answers. Its declaration files import types from `@dialecte/core` (a loaded dialecte is typed by them): type-checking
a program that uses the entry needs those types (`@dialecte/core` installed) or `skipLibCheck`.

The `fixture` tests judge every document twice:

- with core's `assertValidXml` (and scl's validator), which parse with the browser's `DOMParser`: in Node
  they borrow the cli's `@xmldom/xmldom` development dependency;
- with `xmllint --noout --schema` (libxml2; the test fails when it is not installed - CI installs
  `libxml2-utils`), on the fixture of every element: core's test dialecte against the XSD core ships,
  `@dialecte/core/test/xsd/test.xsd` of the core the tests run on, always.

The scl cases run when `DIALECTE_SCL_DIR` names a built scl checkout; the scl validity case also needs
`DIALECTE_SCL_XSD`, the path of the scl schema's entry XSD on your machine (the schema does not ship with any
package). Both are skipped, by their name, otherwise, and are not run in CI.

## How it fits the ecosystem

| Package                            | Bin               | Audience                 | Phase    |
| ---------------------------------- | ----------------- | ------------------------ | -------- |
| `@dialecte/create`                 | `create-dialecte` | new-dialect authors      | scaffold |
| **`@dialecte/cli`**                | **`dialecte`**    | **dialect authors / CI** | **dev**  |
| `@dialecte/core` · `@dialecte/scl` | —                 | libraries                | runtime  |
