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

`dialecte --help` lists the commands by family; `dialecte <command> --help` prints that command only (its
verbs, flags, exit codes and one example); `dialecte --help --json` answers every command, verb, flag and exit
code from the one map the code declares (each command's `verbs` and `flags` derived from its usage lines, and
`renamed`: every old form with its new one), and `dialecte <command> --help --json` that one command in the same
shape. Exit codes: 0 an answer or green, 1 nothing found or a failed check,
2 usage or refused; a command's help says when it differs.

```
Discover    api  members  schema  explain
Use         run  fixture  new
Grow        lot
Check       gate  tdd  rules  contrib  mutants
Hand over   handover
Workspace   worktree  doctor  models  skills
Maintain    bench  coverage  narrowing  audit  text
```

```
dialecte api find "<need>" # find a method by what you need; api show <path>: one method's contract
dialecte members <expr>    # what an expression of the live types holds
dialecte schema <Tag>      # what an element may hold and where
dialecte explain <code>    # what an error or diagnostic code means, when it is raised, the usual fix
dialecte run <script.ts>   # run a script on an in-memory project of the installed dialecte: one structured outcome
dialecte fixture <Tag>     # the smallest valid XML document holding an element, built by the dialecte's engine
dialecte new verb <namespace> <query|transaction> <name>
dialecte lot exempt|accept|revised|gone|mutation   # the lot declaration .dialecte/lot.json
dialecte lot finding|decide|snapshot|choice|standard <folder> ...   # a lot's review rounds, in its hand-over folder
dialecte lot delta <folder> --round <n>   # the fix diff since round n-1; --worktree: the old code to run a test on
dialecte lot recap <folder>   # the pull request's expandable part, built from the hand-over's records only
dialecte lot close <name|index>   # a finished lot: node_modules to the pool, its worktree to the trash
dialecte gate [--full]     # the package's Definition of Done, with the real counts
dialecte gate --hook       # in a commit hook: the suite, unless a green gate --full of the committed tree answers it
dialecte tdd red|green|status   # receipts: each new test failed on an assertion before the code, then passed untouched
dialecte rules             # code-rules self-check of the changed files
dialecte contrib           # the contributor checks, after gate --full and before the hand-over
dialecte mutants run|status|schedule|abandon|migrate|judge|record|drop   # mutation testing of the declared scope
dialecte handover write <lots.json>   # the guarded commit-by-lots hand-over a human runs (handover <lots.json> too)
dialecte handover show|run|abandon|list|--legend
dialecte worktree add|prune     # a worktree ready to work in; what a merge left behind
dialecte doctor            # versions, core API generation, skills and station agents in sync, local checkouts
dialecte models            # which model each tier (fast, standard, strong, frontier) means for your vendor
dialecte skills sync|generate|check|changed   # the agent skills your dependencies ship, and this package's own
dialecte bench [--check]   # measure the type-instantiation cost of your own types; --check gates CI
dialecte coverage          # generate complete, schema-driven type-coverage probes
dialecte narrowing         # assert schema-derived type narrowing still holds
dialecte audit             # render the public type surface and flag readability issues (C1-C6)
dialecte text check <file> # the human part of a GitHub text: its fixed headings and its word cap
```

### Renamed in 1.0

The review rounds' commands moved under `lot`. The old forms run nothing and write nothing: each answers
`renamed: dialecte <old> is now dialecte <new>` on stderr, exit 2, until 2.0. Its second line is the full new
command with the same arguments, or, with no arguments, the new form's usage line; `record` or `review`
without a verb lists every form that replaced it. Asked with `--help`, an old form prints the same answer on
stdout, with the words given before `--help`, exit 0; with `--help --json` it prints
`{ renamed: [{ old, new }] }`, the words after `dialecte` (`record` lists its five forms).

| 1.0                                                                                   | Before                     |
| ------------------------------------------------------------------------------------- | -------------------------- |
| `dialecte lot finding <folder> --round <n> --severity <s> --at <file:line> <finding>` | `dialecte record review`   |
| `dialecte lot decide <folder> <id> <state>`                                           | `dialecte record decision` |
| `dialecte lot snapshot <folder> --round <n>`                                          | `dialecte record snapshot` |
| `dialecte lot choice <folder> --by <who> <decision>`                                  | `dialecte record choice`   |
| `dialecte lot standard <folder> consulted <note> \| not-consulted <reason>`           | `dialecte record standard` |
| `dialecte lot delta <folder> --round <n> [--worktree] [--json]`                       | `dialecte review delta`    |
| `dialecte lot recap <folder>`                                                         | `dialecte recap`           |

`dialecte handover write <lots.json>` names what `dialecte handover <lots.json>` does; the old form stays.

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

- **In an app**: `npx @dialecte/cli skills sync` links the consumer skills of your `@dialecte/*` (and any
  other) dependencies into `.claude/skills` and `.agents/skills` (Codex, Cursor, Gemini CLI, Copilot read the
  latter; add `--agent copilot` for `.github/skills`). Links follow your installed versions; rerun after
  adding a dependency. `--copy` writes copies instead of links.
- **Consumer and contributor skills**: a skill whose frontmatter says `metadata:` / `audience: contributor` is
  for changing a dialecte package (core's `dialecte-contributing`, `dialecte-lot`); a skill without one is a
  consumer skill. A sync installs the consumer skills only and names the contributor skills it left out;
  `--contributing` installs them too and is remembered (`contributing` in `.dialecte-skills.json`) until
  `--no-contributing` removes them. `dialecte doctor` expects the skills of the audience the manifest says;
  `skills check` refuses another audience value.
- **Station agents (Claude Code)**: when Claude Code is a target (the default), the contributor skills are
  installed and the project's model vendor is anthropic, `skills sync` also writes one agent per station of `dialecte-lot` into
  `.claude/agents/dialecte-<station>.md`: `implementer` and `fixer` (standard tier), `implementer-strong` and
  `reviewer` and `grader` (strong), `eval-runner` and `standard-reader` (standard), `searcher` (fast). Each file
  sets the model (from the `dialecte models` map, as the alias Claude Code accepts: `sonnet`, `opus`,
  `haiku`) and the tools: the reviewer holds the read tools and Bash (it runs the tests) and no Write or Edit,
  the searcher and the grader hold read tools only. These files are adapters: a station's tier and access
  (`read`, `review`, `edit`) are the cli's, its definition is the `dialecte-lot` skill's `references/stations.md`
  (one `### <station>` section with a `- Tier:` and an `- Access:` line), and the Claude tool names are only the
  Claude form of the access. The body is a few lines naming the station and its section in the installed
  `.claude/skills/dialecte-lot/references/stations.md`, the skills to load and the never-list; it never copies a skill.
  The `eval-runner` and the `grader` read neither the page nor a lot skill (they judge the skill under test): their
  brief carries their definition and names the only skill text they read. `skills check`, in a package shipping `dialecte-lot`, refuses a
  `references/stations.md` that is missing, lacks a station, has an unknown section or a `Tier:` / `Access:` line out of
  line with the cli. The files are owned through the manifest: replaced on
  every sync, removed when no longer produced, and a file of your own with the same name is reported, never
  overwritten. `dialecte doctor` warns about a stale or missing one. Other hosts (Copilot / VS Code, Codex,
  Gemini) get no agent files from this command yet: the tier of each station comes from `dialecte models`
  there, as the `Tier:` line of a brief says.
- **Session-start check, every agent**: when `dialecte-lot` is installed by the sync (whatever the targets),
  `skills sync` writes a section in the project's root `AGENTS.md`, between `<!-- dialecte-skills:session-check -->`
  and `<!-- /dialecte-skills:session-check -->`, telling the agent to run `npx --no-install @dialecte/cli doctor --brief`
  at a session start. It is created when there is no `AGENTS.md`, else appended after one blank line (every byte of
  your text stays, line ends included), replaced when an older release wrote another sentence, and removed (with the
  blank line it added, the file deleted when nothing else is left) by `--no-session-check`, `--no-contributing` or
  a sync without `dialecte-lot`. A marker without its pair, or a doubled one, leaves the file alone with a warning.
  An `AGENTS.md` holding only the section is no evidence of a vendor.
- **Session-start check (Claude Code)**: the same check as an adapter: `skills sync` adds a `SessionStart` hook running
  `npx --no-install @dialecte/cli doctor --brief` (the installed cli: no download at a session start) to
  `.claude/settings.json`, inserted by a minimal text edit (the rest of your file stays byte for byte), never
  duplicated, removed when you drop the claude target. If you edited the hook's text since, removal cuts only
  our handler (a comment right next to it may go with it) and writes nothing when anything else would change. Agents and hook are written only when `dialecte-lot`
  is installed for Claude Code. `doctor --brief` prints nothing when the skills, the
  versions and the station agents are in sync, otherwise one line per problem with its fix, and always exits 0.
  `--no-session-check` leaves the hook out (and removes the one a sync added). Elsewhere, the `dialecte` skill
  tells the agent to run `doctor` first.
- **Working on Dialecte**: `npx @dialecte/cli skills sync --from ../ --contributing` takes them from your local
  checkouts, the contributor skills included.
- **In a package**: `dialecte skills generate` rewrites the `<!-- dialecte-skills:generated <kind> -->`
  blocks (`extensions`, `core-methods`, `hooks`, `api`, `intents`) from the source; the `api` block lists
  the methods, then one section per package entry (each `exports` subpath shipping a `.d.ts`) with the
  functions it exports.
  `dialecte skills check` verifies every API, path and npm script a page cites, and that every public
  method and every function an entry exports (not `@internal`) has a JSDoc summary and an `@intent` tag; it warns when a summary or an
  intent quotes a sentence, since the generated pages republish the JSDoc. A page about several
  repositories declares `<!-- dialecte-skills workspace -->` and is fully verified with
  `--workspace <folder>`; a deliberate outside mention goes in `<!-- dialecte-skills ignore: token -->`.
  It also verifies every cli invocation a page cites in code (inline code and fenced blocks of any language,
  never prose; generated blocks left out): one starting with `dialecte` or `@dialecte/cli`, after `npx`, a
  `$ ` prompt or a shell operator. Its command, its verb and each `--flag` must be in the command map of the
  cli the package uses (the cli's own map in the cli itself, else what the installed `@dialecte/cli` answers to
  `dialecte --help --json`); an unknown one, or an old form of a command renamed in 1.0 (see "Renamed in
  1.0"), is an error at `page:line` naming the closest valid form, or the new form, on a workspace page too. A quoted word, a
  `<placeholder>` and what follows a bare `--` are not checked; `ignore:` takes the offending word (`record`,
  `--fats`). With no installed cli, or one before the map, the invocations are not checked: one warning says
  why and the summary line says so. A versioned `@dialecte/cli@<version>` and what follows an unclosed `<` are
  not read.

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
  IntelliSense walk on demand, from the live types of the package where it runs. In an app it reads the
  installed dialecte (a dependency built on `@dialecte/core` exporting `./<version>` with its `./<version>/test`
  entry: its namespace is its name capitalized, `Scl` from `@dialecte/scl/v2019C1`); with several, it lists them and
  `--package <name>` / `--version <v>` picks one. `--namespace <Name> --entry <module>` override.
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
  (Copilot, Cursor) or none are found. Without a terminal, a sync that cannot tell installs the skills without a vendor (`models` stays
  unset: the skills need none) and says how to set it: `--vendor <id>`, which also sets it without asking. When manifests disagree, `models` warns on stderr, naming them, and uses the
  most recently written; an unknown vendor id in a manifest is ignored with a warning. Exit 1 for an unknown
  `--vendor`, 2 when no vendor is known.

Run outside a package (no `package.json`), each answers a usage error.

## MCP server

The MCP server of the read-only lookups is its own package: [`@dialecte/mcp`](https://github.com/dialecte/mcp) (`npx @dialecte/mcp`). It builds on the pure answer functions this package exports at `@dialecte/cli/lookups`.

## Profiles

One field of package.json says what the package is to the cli:

```json
"dialecte": { "profile": "contributor" }
```

- `consumer` (the default, a package without the field): an app built on a dialecte. It runs the canon: the
  gate steps, the tdd receipts, the review ledger, the hand-over. `rules` and `handover` refuse a citation
  of a standard and the package's own `referencePatterns`; tags (`plan tag`, `acceptance criterion`,
  `ticket number`) are allowed. Mutation testing is off unless `dialecte.mutation.scope` is declared
  (`mutants run` without one says how to opt in). `dialecte contrib` refuses with exit 2.
- `contributor`: a package of the Dialecte family. The same canon, and the contributor checks: tags are
  refused too (minus those `allowReferences` lifts), `dialecte contrib` runs the code rules, the docs build,
  the type bench and the release guard, and `skills sync` installs the contributor skills (`--no-contributing`
  is refused). A contributor never names the tools that consume it: list them once on the machine with
  `git config --global dialecte.consumerNames "<name>, <name>"` (never committed, so the names stay out of the
  repository) and `rules` and `handover` refuse them as whole words (`consumer tool name`).
- Any other value is refused by every command that reads it:
  `dialecte.profile: "<value>" is not a profile; profiles: contributor, consumer`.

The profile is read from the package.json at the command's root, never from a flag or the environment: it
describes the package, not the session. `dialecte doctor` prints it (`profile consumer (default)`), warns on
an `allowReferences` a consumer does not need, on a contributor whose `dialecte.gate.full` still holds `docs`
or `type-bench` (they belong in `dialecte.contrib.steps`, or drop them for the defaults) and on a contributor
whose skills were synced without the contributor ones; an invalid value is an error line (`❌`).

`dialecte contrib` (in a contributor, after `gate --full` and before `dialecte handover`):

```json
"dialecte": {
	"profile": "contributor",
	"contrib": { "steps": [{ "name": "docs", "run": "npm run doc:build", "restoresGeneratedDocs": true }] }
}
```

`contrib.steps` replaces the default package steps (`docs`, `type-bench`); `[]` keeps the built-in rows only
(`rules`, `release`). See the command under [Contributing to a Dialecte package](#contributing-to-a-dialecte-package).

The hand-over follows the profile:

- A consumer's card holds, in `gates`, the gate steps, the review and the standard line, and a `mutation`
  line only when a scope is declared: no `rules`, `docs`, `type-bench` or `release` line, no contrib
  section. `handover run` has no `contrib` guard; its `references` guard refuses `a standard citation`.
- A contributor's card has the same `gates` and a `contrib` section after them: the rows of the
  `dialecte contrib` record of the tree the lots leave (`rules`, the package's steps, `release`), then the
  live `mutation` row. Every row green: one line, `✓ contrib  rules · docs · type-bench · release`, with the
  record's source (`· rehearsal`, `· from <commit>`); any `!` or `✗`: one line per row. No record of the
  tree: `✗ contrib  never run: dialecte contrib`. `handover run` checks a `contrib` guard between
  `references` and `mutation`: a green contrib record of the tree the lots leave, at the lots file's HEAD,
  against what is installed now; else `no green dialecte contrib of this tree: run dialecte contrib`, or the
  failed rows' names. Its `references` guard refuses `a plan tag or a standard citation`. A rehearsal never
  stops at the guard (a refusal prints `! contrib  ... (the real run refuses; the rehearsal goes on)`): when
  the tree the lots leave has no green contrib record (a merge lot's merged tree too), it runs
  `dialecte contrib` in its scratch clone first, at the lots file's HEAD, and the card reads that record
  `· rehearsal`. When the lots change what the record is keyed by (a merge bringing other contrib steps, the
  install, the linked dependencies), no record can answer the real run: the rehearsal says which part, and
  does not run contrib.
- Both profiles get the card's `standard` line (see the hand-over card below) and
  `dialecte lot standard <folder> consulted <note> | not-consulted <reason>`.

## Contributing to a Dialecte package

Twelve commands for whoever changes a Dialecte package, a person or an agent. Each answers the same way
every time: exit 0 when green, 1 when a check fails, 2 on a usage error; `--json` where a program reads
the answer.

- `dialecte rules [<files...>] [--json]` checks the code rules on the syntax tree of the changed files
  (or the files given): exported types outside a `*.types.ts` file, module constants outside a
  `*.constants.ts` file, functions declared as `const`, an `await` inside an argument, standard
  citations and the package's `referencePatterns` (and, in a contributor, plan tags, acceptance criteria
  and ticket numbers: see [Profiles](#profiles)) are errors, and so is a test that takes the system's temporary folder itself as
  its root (`tmpdir()` handed to a call that lists or scans a folder, or given as `root` / `cwd` /
  `scratchRoot`...: other tests and processes share it; `mkdtempSync(join(tmpdir(), '<prefix>-'))`
  gives the test a folder of its own); positional parameters (beyond a leading `query` / `tx`, a
  symmetric pair aside) and abbreviated names are warnings. Without file arguments it records its result
  in the worktree's git folder (`dialecte-rules.json`: when, HEAD, the state hash, the files, the errors
  and warnings), which `dialecte lot recap` reads; a run on named files records nothing.
- `dialecte gate [--fast | --full] [--base <ref>] [--no-reuse] [--declare <path>]... [--json]` runs the Definition of Done: `--fast` (default) `check`,
  `skills:check` and the tests of the changed files; `--full` adds `build` and the whole suite (the
  runner's defaults: every file in parallel). The docs build and the type bench are contributor checks:
  `dialecte contrib` runs them (see [Profiles](#profiles)). Each step runs unfiltered, with
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
  tdd step with the cases of the change it judged (`cases`: label and status); a run refused at the hygiene records nothing. The state hash is that of the tree the
  worktree would commit (HEAD's tree with the changed and untracked files on top, the deleted ones
  removed, `.dialecte/` left out): committing the lots leaves it the same, any other edit changes it.
  The record also holds its `key`, what the run checked: `tree` (the git tree id the state hash is the
  sha256 of), `lockHash` (sha256 of `node_modules/.package-lock.json`, what npm installed; `none` without
  it), `commandHash` (sha256 of the steps' names and commands in order, and HEAD's commit when a step
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
  kept per mode and key). Before its steps, a gate looks there: a green record of the same mode and the
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
  the same modification time is not seen either.
- `dialecte gate --hook [--no-reuse]` runs in a commit hook: the test steps of `--full` (its steps counting
  tests), unless a green `--full` record of what is committed answers them. Its key is the one a `--full` run of
  that state stores - the tree, what npm installed, the `file:` dependencies, the full gate's command hash - with
  the tree taken from the index git hands the hook (`GIT_INDEX_FILE`, else the worktree's index), never from the
  working files: a merge commit and a partial commit check what they record. A green record of that key prints
  one line, `gate --hook: tests reused from gate --full green on tree <tree> at <time> (HEAD <sha>)`, and runs
  nothing; otherwise `gate --hook: no green gate --full of tree <tree> with this install: running the tests`, the
  test steps (rerun serially on a failure, as the gate does), then one vitest summary line of their summed counts (what the hand-over's hook reader counts),
  and `gate --hook: green` or `gate --hook: failed at <step>` (exit 1). It runs no hygiene and no tdd step,
  reads no hand-over hold (it runs inside `handover run`'s own commit) and records nothing: `handover run`
  records the hook. `--no-reuse` runs the tests whatever the store holds, and so does a hook whose git variables name another
  repository than its folder's (the cli ignores them, so what is committed is unknown); `--hook` with `--fast` or `--full` is
  refused (exit 2). Write it in the hook as an npm script (`"test:hook": "dialecte gate --hook"`), so the
  hand-over reads it as a test step of its own: its card line reads `reused by the hook` when the hook answered
  from a record. The cli's own hook runs `npm run check` (type-check, lint, format; no suite), `npm run
  test:hook`, then `npm run build`.
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
- `dialecte contrib [--no-reuse] [--json]` runs the contributor checks of a package whose profile is
  `contributor`, after `gate --full` and before `dialecte handover`, one line per row: `rules` on the files
  changed against HEAD (recorded as `dialecte rules` records it), the package's `dialecte.contrib.steps`
  (default: `docs`, `npm run doc:build` with the `generatedDocs` restored, and `type-bench`,
  `npm run type-bench:check`; `[]` keeps the built-in rows only) run as the gate runs its steps (a missing
  npm script skips the step), `release` (no dependency named by a local folder), then `mutation` when the
  package declares a mutation scope (read from the mutation store now, never recorded). A package step a
  green `gate --full` record of this tree and install passed with the same name and command is not run
  again: its row says `reused from gate --full at <time>`. The run is recorded as `dialecte-gate-contrib.json`
  in the worktree's git folder and stored by tree like a gate record, its key holding HEAD too (the rules
  row reads the changed files against it); a green record of the same key answers the rows
  (`reused: contrib green on this tree at <time> (HEAD <sha>)`), `--no-reuse` runs them and every step a
  `gate --full` passed. Exit 0 green, 1 a row failed, 2 refused (a consumer, where nothing is written, or
  a value of package.json no command accepts). `--json`: `{ profile, rows: [{ name, status, detail }],
  reused?: { at, head } }`.
- `dialecte tdd red|green|status [<test file> | <test file>::<case name>]... [--base <ref>] [--json]` makes
  the order of the work visible: tests written from the spec before any code, red for a real reason, then
  made green by an implementation that did not touch them. The ledger lives in the worktree's git folder,
  never in the tree. Runs use the package's own vitest (each project's run of a case is a case of its own),
  with snapshots never written
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
    helper no red covers stays unfrozen, and the gate fails on it, unless a `revised` entry names it
    (below). An import that looks local (`@/`, `~/`,
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
    red when it fails) and freezes its file and the changed test code it depends on. A file or glob entry
    may also name a test helper (test code that is not a test file: a helper, a fixture, a constant beside
    the tests) edited at review while its dependent cases stay green: the next `tdd red` freezes it at its
    new hash and prints `revised  <helper>  <reason>`, when every changed test file depending on it (at
    least one) is in the run and frozen by it with no case red (a refused file, a red still waiting for
    its green, or no dependent file in the run leaves it unfrozen; a changed dependent outside a targeted
    run too, named on an `unfrozen  <helper>` line). The new freeze makes the dependent
    cases' earlier green stale: `tdd green` proves them again. Without that red run the gate fails on the
    edit; `status` lists the revised cases, the gate and the hand-over card list the revisions (cases
    and helpers) with their reason, an entry (exact, file or glob) no revised case or helper used as a
    note.
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
- `dialecte handover write <lots.json> [--out <dir>] [--rehash] [--json]` (or `dialecte handover <lots.json>`) prepares the commit-by-lots
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
  file is in no lot or in two, or a lot file (evals included) or message holds a standard citation, one
  of the package's `referencePatterns`, or, in a contributor, a tag (see [Profiles](#profiles)). Otherwise it writes the hand-over folder - the lots file, the snapshot (`files.txt`,
  `files.sha256`, `files.deleted`, and `lots.sha256`: the lots file as reviewed) and a one-line
  `commit.sh` that runs
  `npx --no-install @dialecte/cli handover run <folder>` (bash, also run with `sh`; when the repository
  installs no cli that can, it says so in one line with the fix) - and prints the hand-over card, the
  command with its absolute `cd` under it. The folder is the lots file's, or `--out <dir>`. Every hand-over
  written is registered in the repository's store, `<git common dir>/dialecte-handover/`: shared by every
  worktree of the repository, kept when a worktree is removed, never in the working tree. The store holds
  one entry per hand-over, `<name>.json` = `{ folder, branch, worktree, index, written, state }` (the folder's
  absolute path, the lots file's branch and repository, the worktree's index when its folder is numbered
  (`0171` for `.worktrees/0171-cli-x`, absent otherwise), when it was written, and its state as last
  recorded: `pending` when written, `committed` by a real run that commits every lot, `abandoned` by
  `handover abandon`); the folder stays where it was written. The name is `<yyyy-mm-dd>-<branch slug>[-<n>]` -
  the local date, the branch with every run of characters outside `[A-Za-z0-9._-]` (the `/` included)
  turned into one `-`, then `-2`, `-3`... when that name has an entry already. A folder registered already
  (the same real path) keeps its name: `--rehash` updates its entry, never a second one. A rehearsal and
  `show` write no entry. `--json` answers the card as data: the verdict, `profile`,
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
  when it is inside it (`.worktrees/0171-cli-x`, `cli` for the main checkout), else its absolute path. Its
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
    since the hook names its own scripts, not the gate's steps; the other way round, a hook record of the
    tree the hand-over commits, not dropped by a newer gate record of that tree, replaces the lines of
    every gate record of another tree it answers - a step of the same name, or a step counting tests when
    the hook counts tests: a merge hand-over rehearsed or committed reads the hook's lines of the merged
    tree, the worktree's `tests` of its tree before the merge left out. No check leaves silently: a step
    the hook did not run reads `! skills  not run on the merged tree` (a warning, not of another tree), a
    failed one stays `✗ ... (the tree changed since)`, and `tdd` stays the worktree's), then, in a consumer, `mutation` when the package declares a mutation scope (below), then
    `review` from the hand-over folder's findings ledger and `round-<n>/` snapshots, then `standard`. `✓`
    passed; `!` to look at (a step not run here, with its reason, or not run after a failure; no
    findings ledger, or one holding no row yet: `no findings recorded`; only nits open); `✗` failed (a
    failed step, a blocking or should-fix finding open, `gate  never run on this tree` when there is no
    record). The records read are the worktree's last runs and the store's records of the tree the
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
    otherwise, with the recorded not-consulted reason when there is one: a warning that never blocks. The station records it
    with `dialecte lot standard <folder> consulted <note>` or `not-consulted <reason>`.
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
    of earlier lots, which the lot file no longer names, on one line
    (`earlier lots: 410 accepted, 12 revised (not in the lot file)`); then
    `<n> revised · <m> gone · <k> unused` with `to read ↓` at its right edge and one entry each: a revised case `<file> › <title>` (named by the lot file exactly, or by a file or glob entry)
    with its reason under it, a helper a red run froze for a `revised` entry as `revised <helper>` with its
    reason under it, a `gone` entry with its reason (whether one covers a finding is the gate's
    to say), an `accept` or `revised` entry no case used. Then one line per kind of flag with its count of
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

- `dialecte handover run <folder>` is what `commit.sh` runs. Each guard prints one line with its result
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
  and the log's path. A hook that ended (passed or failed; not one stopped as stalled) is recorded in
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
  finds the lots already committed on top of the recorded HEAD (same message, same paths, same content)
  and resumes at the next one; anything else on top of HEAD is refused with what was found. It never
  pushes. `--rehearse` first decides, per lot and before any clone, whether rehearsing it can find
  something new, and prints one line per lot: `lot <n>/<N>  reused  <reason>` or
  `lot <n>/<N>  rehearse  <reason>`. A plain lot is reused when the store holds a green `gate --full` of
  the tree its commit will hold (HEAD with every lot up to it on top) with the key of now - the same
  `node_modules`, `file:` dependencies and `--full` steps - the lot does not change `package-lock.json`,
  and the commit hook stages no files of its own (its text names `git add`, `git stage`, `lint-staged` or
  `git update-index`): `green gate --full on tree <tree>`. A merge lot is reused when the tree it leaves
  (its trial merge with its resolutions) is its tip's tree and a green record of that tree - the branch
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
  leave, before any commit, its record going to the repository's store as a rehearsal's; the clone is put
  back after it, the files the run left removed) and
  the reused lots are committed in it with `--no-verify` (their hook skipped, in the clone only), the
  others with their hook. A real run (no `--rehearse`) runs every commit's hook, whatever the store holds.
  The rehearsal clone (`▶ rehearsal clone`) warns naming the untracked files outside
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
  refused when the install changed the staged files or the versions still differ (dev, peer and optional
  packages an install leaves out aside). A real run that leaves every lot committed then moves the worktree's `.dialecte/lot.json`
  into the hand-over folder as `lot.json`, after the card is built, and leaves an empty declaration
  (`{}`) in its place, saying so in one line (`lot file archived: <folder>/lot.json`): the next lot on
  the branch does not inherit its entries. No lot file, an empty one, a rehearsal, a stopped run, or a
  folder that holds a `lot.json` already (a second run) leave the lot file as it is.
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
- `dialecte handover run` without a folder runs the one registered hand-over still to run (its folder
  pending or partly committed; `--rehearse` too): an abandoned, committed, stale or gone one is skipped.
  Two or more: refused, nothing run and no run marker, one `name  branch  verdict` line each (`READY` or
  `BLOCKED`, computed as `show` does), exit 2; none: says so, exit 1. `handover run <name>` runs that
  registered hand-over (a gone one: exit 2, naming its folder).
- `dialecte handover abandon [<name|folder>]` gives up a hand-over that will not run: it writes
  `abandoned.json` (when) in its folder, records its entry `abandoned`, then removes the lock of its worktree when the lock names this
  folder's `commit.sh` (a lock naming another hand-over is left, said in one line). Without an argument:
  the hand-over the current worktree's lock names; no lock: says nothing is held, exit 1. Refused (exit 2,
  nothing written) while a real run of it is in progress, and once every lot is committed; a partly
  committed one may be abandoned, its commits stay. It never touches the index, a ref or a commit. An
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
- `dialecte worktree add <repository> <branch> [--from <ref>] [--json]` makes a worktree under the
  workspace's `.worktrees/<index>-<repository>-<branch tail>` (the last segment of the branch:
  `0171-core-depth` for `feat/depth`; a new branch starts from `--from`, else the base
  branch): it copies the hooks folder `core.hooksPath` names (husky's `.husky/_` is ignored by git, so a
  plain worktree misses it), takes a `node_modules` from the workspace's pool when one matches (below), else
  copies the main checkout's `node_modules` copy-on-write where the file system
  can (links kept, a relative link to a sibling re-pointed so it still reaches it) - from the worktree that
  has the `--from` branch checked out when it has one, else from the main checkout - lists `.dialecte/`
  once in the exclude file of the repository's common git folder (so for the main checkout and every
  worktree of it), and writes the hygiene baseline `gate --fast` compares with; it prints a card.
  The index is 4 digits at least (`0001`, past `9999` it grows), one counter per workspace so the latest
  worktree sorts last: 1 + the highest of the claims in `.worktrees/.index/` (one empty file per index ever
  taken) and the numbered folders and links of `.worktrees/`. A claim is created only where none exists,
  so two runs at the same moment, of any repositories, never take the same index (the other takes the
  next), and a number stays taken after its worktree is removed. Unnumbered folders and the sibling links
  (`.worktrees/core`) count for nothing and are never renamed. `--json` carries `index`.
  The pool: a finished checkout's `node_modules` waits in `.worktrees/_pool-<repository>-<n>/node_modules`,
  with a `pool.json` beside it (`{ repository, lockHash, parkedAt }`, `lockHash` the sha256 of the
  `package-lock.json` it was checked against), at most two entries per repository (parking a third sends
  the oldest to the trash). A park (`lot close`, the end of a rehearsal) takes only a `node_modules` that
  matches its `package-lock.json` (as `worktree add` reads it), rewrites absolute, in place, every link inside
  it whose relative target leaves `node_modules`, renames the folder into a new entry (no file is copied),
  sends `node_modules/.vite` and `node_modules/.cache` to the trash (or leaves them in the folder already
  going there), then writes `pool.json`; a `_pool-*` folder without one is a park that never finished,
  never taken, and `worktree prune` names it as left over. `worktree add` takes the newest entry of the
  repository whose `lockHash` is the new worktree's `package-lock.json` hash (a rename: two takers never
  share one, the second goes on to the next entry), then reads it against the lockfile as it reads a copy.
  No match, an empty pool or a rename across file systems: the copy. The card's `node_modules` row says
  which and how long (`pooled  _pool-cli-1  0.1 s`, `copy-on-write  46.2 s`); `--json` carries
  `nodeModules: { method, from?, seconds }`. The trash: `.worktrees/_trash/` - a worktree goes there by
  `git worktree move` (git keeps it registered) then a background `git worktree remove --force`, a folder
  by a rename then a background `rm -rf` of that one path; nobody waits for either. A folder left there (a
  sleep, a crash) stays for you to look at. The pool and the trash are used only where the repository's
  parent holds `.worktrees/`.
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
- `dialecte lot mutation <off|changed|audit|gate>` writes the lot's mutation switch (`"mutation"`, no
  reason). Without it, `dialecte mutants run` mutates the changed lines when the lot's diff touches the
  declared scope and nothing otherwise; `audit` mutates the whole scope; `gate` runs as `changed`.
- `dialecte lot standard <folder> consulted <note> | not-consulted <reason>` writes `<folder>/standard.json`
  (`{ state, note, at }`, the note's words joined by single spaces) for the card's `standard` line; the line
  references of what was read stay in the findings ledger. Another state, or no note, is a usage error
  (exit 2); a folder inside a repository is refused as below.
- `dialecte lot finding`, `decide`, `snapshot`, `choice` and `delta` keep a lot's review rounds in its
  hand-over folder (`_commit-plan/<topic>-<date>/`), which stays outside every repository: each refuses a
  folder inside a git work tree or a git folder (`.git/`, a bare repository). `--` ends the options: the
  words after it are taken as they are, so a finding or a reason may start with `--`.
  - `lot finding <folder> --round <n> --severity <blocking|should-fix|nit> --at <file:line> <finding>`
    appends the row `| R<n>-<k> | <n> | <severity> | <file:line> | <finding> | open |` to
    `<folder>/findings-ledger.md` (the folder, the file and its table made when absent; k one past the
    highest of the round). A `|` is written `\|`; a line break is refused. A hand-written ledger keeps
    every other byte.
  - `lot decide <folder> <id> <state>` rewrites that row's state cell: `open`, `fix-to-verify`,
    `fixed <round> [note]` (a round after the one that raised it), `accepted <reason>`, `logged <where>`.
    An id not in the ledger is refused, naming the ids it holds.
  - `lot choice <folder> --by <who> <decision>` appends `| <decision> | <who> | <yyyy-mm-dd> |` to
    `<folder>/decisions.md` (made with its title and table when absent): a decision made outside the
    findings ledger, the user's above all. A `|` is written `\|`; an empty `--by`, a line break, or more
    than one decision word (quote it) is refused.
  - `lot snapshot <folder> --round <n>` copies every file `git status --porcelain -z
    --untracked-files=all` lists at the worktree root (the old path of a rename included) to
    `round-<n>/` at its repository-relative path - bytes, mode, a symlink as a symlink; a path gone from
    disk (or now a folder) that HEAD holds goes in `round-<n>.deleted`, NUL-separated, sorted; HEAD in
    `round-<n>.base`. An existing round, an untracked nested repository and a submodule (a gitlink in the
    index or at HEAD) are refused; a run that
    stops part-way leaves only `.partial` names, which the next run removes. `.dialecte/lot.json` is
    never part of it.
  - `lot delta <folder> --round <n> [--worktree] [--json]` (n ≥ 2) prints, for each file of
    `round-<n-1>/`, of `round-<n-1>.deleted` or of the worktree's status, what changed since round n-1,
    in the form that fits where the file is: the snapshot copy against the worktree file (or
    `/dev/null` when it is gone), `/dev/null` against a file deleted then and back now or new and absent
    from the base, `git diff HEAD` for a file round n-1 had at the base. Files unchanged since round n-1
    are left out; colour, external diff and textconv settings never apply. It refuses when HEAD moved
    since `round-<n-1>.base`, and refuses a nested repository or a submodule as `lot snapshot` does. `--worktree` adds a throwaway worktree on the branch
    `<lot branch>-round-<n-1>` from the lot's branch tip, in `.worktrees/<index>-<repository>-<branch
    tail>-round-<n-1>` with the lot's own index when its worktree is numbered (no new claim; else the
    workspace's next): the deletions applied with `git rm
    --pathspec-from-file`, then `round-<n-1>/` copied over, so a new test can run on the old code; it
    prints its path and the removal command with its absolute `cd`. The lot's worktree is never
    changed. Its `node_modules` comes from the pool, or a copy, as for `worktree add`.
  - `lot close <hand-over name|index>... [--json]` closes finished lots: for each hand-over of the registry
    named (by its name or its worktree's index) whose state is `committed` or `abandoned`, its worktree (the
    path the registry entry holds) is closed: every decision first, for every argument with every rule, its
    own state and branch included (one worktree reached by several names or indexes closes only when every
    one of them may close, and then once, the other arguments answered "the same worktree as ..."; when one
    keeps it, every one of them is kept, each line with the reason), its
    `node_modules` read against the lockfile where it is; then the links of its `node_modules`
    made absolute where they are, the worktree moved to the trash (`.worktrees/_trash/`, by
    `git worktree move`), its `node_modules` parked in the pool (`.worktrees/_pool-<repository>-<n>`) from
    there, its caches left in the trashed folder, and the trashed worktree removed in the background. Kept,
    with why and nothing done for that hand-over: a hand-over still `pending`; its worktree is the main
    checkout (never parked, moved or trashed); no registered worktree at that path (closed already, or one
    in the trash or the pool: never a target again); a worktree on another branch than the hand-over's
    (both branches named: it holds other work now); a `locked` worktree (`git worktree lock`); a mutation
    run started from it that still runs or died before reporting; a process whose working folder is in it;
    the processes not known (`lsof` failed or took longer than 20 s); a `dirty` worktree (anything
    `git status --porcelain --untracked-files=normal` lists, untracked files included whatever
    `status.showUntrackedFiles` says). The branch is never touched (`worktree prune` still lists the merged
    ones). Each line names the folder it moved and where `node_modules` went (`closed  <name>: 0007-cli-x;
    node_modules pooled in _pool-cli-1`, or `trashed: <why it was not parked>`); a failure part-way keeps
    that hand-over with the error and what was already moved, the others go on. Exit 0 when every named
    hand-over closed, 1 when one was kept, 2 for a name or index the registry does not hold (then nothing is
    closed); `--json` prints `[{ handover, closed: true } | { handover, kept }]`.
- `dialecte mutants run [--mode changed|audit] [--base <ref>]` runs StrykerJS (resolved from the package,
  its devDependency) on the scope `package.json` declares:
  `"dialecte": { "mutation": { "scope": [...], "exclude": [...], "errorFactories": [...], "fast": { "vitestConfig": "..." }, "full": { "command": "..." } } }`.
  `changed` mutates the scope lines changed since the merge base with the base branch (`dialecte.baseBranch`,
  `main` when not said; then the remote's default branch, `refs/remotes/origin/HEAD`; with neither the run
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
- `dialecte worktree prune [--root <workspace>] [--yes] [--json]` lists, per repository of the workspace,
  the worktrees and local branches whose commits are all in the base branch, the hand-over folders whose
  lots are all committed (never `_commit-plan` itself, nor a folder holding other folders) and the
  rehearsals whose process is gone - the rehearsal folders under `/tmp` (each goes whole) and the clones
  earlier cli versions made in the system's temporary folder, each judged by its marker - with the
  command that removes each (its absolute `cd` first).
  `--yes` runs them after a confirmation on a terminal; without a terminal it refuses, so hand the
  commands (or the `--yes` command) to a person. Kept, each with why: an unmerged branch; the branch the
  main checkout is on; a worktree a mutation run was started from while that run still runs
  (`mutation run <id> still running (pid <pid>)`) or after it died before reporting
  (`mutation run <id> died before reporting: rerun or dialecte mutants abandon <id>`; a reported or
  abandoned run keeps nothing); a worktree a hand-over is pending in, or with uncommitted changes; a branch whose
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
  `git --no-optional-locks`, so it never rewrites an index. Each hand-over's repository is read once for
  the whole workspace, and its state once, never once per repository. `handover list` follows a link to a
  hand-over folder and lists a folder reached by its path and through a link once. The pool entries and the
  trash (a worktree in `_trash/` included) are never listed nor touched: one line each,
  `pool: 2 entries (cli 1, core 1)` and `trash: 3 folders, being deleted or left over`.

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
`flaky <file>` line under it per file, the note kept in the gate record. Otherwise the step fails as a
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
case passes `tdd red` as accepted and does not block its file; the gate lists each acceptance with its
reason, the hand-over card counts them by reason from the receipts (those of earlier lots, which the file
no longer names, counted on one line), and both report an acceptance or a `revised` entry no case used. The card
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
	"baseBranch": "main"
}
```

`gate.fast` / `gate.full` replace the default steps of that mode (`counts: "tests"` makes a step fail
when it counts no test; `changedOnly: true` marks a step that runs only the tests the change affects,
so "No test files found" passes with a note instead of failing; `restoresGeneratedDocs: true` restores the `generatedDocs` byte for byte after
it); `baseBranch` is the branch
`worktree add` starts from and `worktree prune` compares with (default `main`); `referencePatterns` adds the package's own patterns (extended regular expressions) to the
citations (and, in a contributor, the tags) `rules` and `handover` refuse; `allowReferences` is the contributor's
opt-out: it lifts generic tags a contributor commits on purpose - `ticket number`, `acceptance criterion`,
`plan tag` - and refuses any other label in either profile: a citation of a standard is never allowed. A consumer
allows every tag already, so `allowReferences` changes nothing there (`dialecte doctor` says to remove it). A lot may hold a symbolic link, a link to a
folder included: it is hashed and scanned as its target text and committed as a link, the way git stores it (a
rehearsal copies it as the same relative link).

### GitHub text: lot recap and text check

Text written with an assistant tends to retell the diff and grow long. The pull request splits in two:
an expandable part made from records, and a short human part that is checked before it is posted. Both
commands only print; the user posts.

- `dialecte lot recap <hand-over folder>` prints the expandable part (`<details>`) as GitHub markdown, from the
  records only: the commits of the lots (or `not committed yet`), the test cases the newest gate record of the
  current tree judged red then green, counted per test file, the gate and rules lines (and `mutation`), the
  lot's mutation runs (`Mutation`: each run of the branch and of the branches it merges, oldest first, with
  its mode, id and counts or its state; each survivor those runs killed or recorded; each survivor first seen
  on those branches and scheduled, with its follow-up; `No mutation run.`, or `No mutation scope declared.`
  for a package without one), the review rounds from
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

The cli has a commit hook: `.husky/pre-commit` runs `npm run check` (type-check, lint, format; no suite), then
`npm run test:hook` (`dialecte gate --hook` from the sources: the suite, unless a green `gate --full` of the
committed tree answers it), then `npm run build`. `npm install` in the
cli checkout activates it (`"prepare": "husky"` sets `core.hooksPath` to `.husky/_`), and `dialecte worktree add`
copies `.husky/_` into each new worktree, so `handover run` proves a cli lot again at its commit, running the
suite only for a tree no green `gate --full` checked. A hook
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
