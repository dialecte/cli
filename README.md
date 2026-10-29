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
dialecte skills check      # fail on a skill citing what the code no longer has
dialecte api find "<need>" # find a method by what you need
dialecte api show <path>   # read one method's contract
dialecte members <expr>    # what an expression of the live types holds
dialecte schema <Tag>      # what an element may hold and where
dialecte models            # which model each tier (fast, standard, strong, frontier) means for your vendor
dialecte doctor            # versions, core API generation, skills and station agents in sync, local checkouts
dialecte rules             # code-rules self-check of the changed files
dialecte gate [--full]     # the package's Definition of Done, with the real counts
dialecte new verb <namespace> <query|transaction> <name>
dialecte handover <lots.json>   # the guarded commit-by-lots hand-over a human runs (run, list)
dialecte worktree add|prune     # a worktree ready to work in; what a merge left behind
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
  blocks (`extensions`, `core-methods`, `hooks`, `api`, `intents`) from the source.
  `dialecte skills check` verifies every API, path and npm script a page cites, and that every public
  method the package defines has a JSDoc summary and an `@intent` tag; it warns when a summary or an
  intent quotes a sentence, since the generated pages republish the JSDoc. A page about several
  repositories declares `<!-- dialecte-skills workspace -->` and is fully verified with
  `--workspace <folder>`; a deliberate outside mention goes in `<!-- dialecte-skills ignore: token -->`.

## Lookups for agents (and people)

Each answers in a few lines, the same with or without the Dialecte repositories, and takes `--json`.
Exit codes: 0 an answer, 1 nothing found (or a warning for `doctor`), 2 a usage error.

- `dialecte api find "<need>" [--package <name>] [--limit 5]` searches the `api.json` every installed
  package ships next to its skill's `api.md` (written by `skills generate`): one line per method - route,
  `q | tx | doc | project`, the intent that matched, the package. Ranking, in order: how many words of the
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

Six commands for whoever changes a Dialecte package, a person or an agent. Each answers the same way
every time: exit 0 when green, 1 when a check fails, 2 on a usage error; `--json` where a program reads
the answer.

- `dialecte rules [<files...>] [--json]` checks the code rules on the syntax tree of the changed files
  (or the files given): exported types outside a `*.types.ts` file, module constants outside a
  `*.constants.ts` file, functions declared as `const`, an `await` inside an argument, plan tags and
  standard citations are errors, and so is a test that takes the system's temporary folder itself as
  its root (`tmpdir()` handed to a call that lists or scans a folder, or given as `root` / `cwd` /
  `scratchRoot`...: other tests and processes share it; `mkdtempSync(join(tmpdir(), '<prefix>-'))`
  gives the test a folder of its own); positional parameters (beyond a leading `query` / `tx`, a
  symmetric pair aside) and abbreviated names are warnings.
- `dialecte gate [--fast | --full] [--no-wait] [--declare <path>]... [--json]` runs the Definition of Done: `--fast` (default) `check`,
  `skills:check` and the tests of the changed files; `--full` adds `build`, the whole suite (niced, one
  file at a time), `doc:build` and `type-bench:check`. Each step runs unfiltered and is judged on its exit
  code and on the counts it printed: a step exiting non-zero fails whatever it says, a test step that
  counts no test fails - except `--fast` on a change that touches no test (a doc edit): the changed-tests
  step passes with the note "no test file is affected by the change". A step whose npm script the package lacks is skipped. The gate refuses to run
  while a hand-over script holds the repository.
- `dialecte new verb <namespace> <query|transaction> <name> [--version <v>]` writes a verb of a dialecte
  package in the house style: the function (query or transaction first, one params object), its
  `.types.ts`, a table-driven test with one red case marked `only`, its barrel export and, for a new
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
  	"gates": "npm run check (217 tests), build",
  	"lots": [
  		{ "paths": ["src/names/"], "message": "feat(names): names stay unique among siblings" },
  		{ "paths": ["CHANGELOG.md"], "message": "docs(changelog): unique names" }
  	]
  }
  ```

  It refuses (and writes nothing) when the branch or HEAD differ, `core.hooksPath` names a folder that
  does not exist (git would skip every hook; it says how to restore it), something is staged, a changed
  file is in no lot or in two, or a lot file (evals included) or message holds a plan tag or a standard
  citation. Otherwise it writes the hand-over folder - the lots file, the snapshot (`files.txt`,
  `files.sha256`, `files.deleted`, and `lots.sha256`: the lots file as reviewed) and a one-line
  `commit.sh` that runs
  `npx --no-install @dialecte/cli handover run <folder>` (bash, also run with `sh`; when the repository
  installs no cli that can, it says so in one line with the fix) - and prints the card: repository,
  worktree, branch, HEAD, gates, each lot with its files, lines added and removed and its subject, and the
  command with its absolute `cd`; `--json` answers the same as data. Edited a file after the review?
  `--rehash` (also after editing `lots.json`). The repository stays locked for `dialecte gate` until
  every lot is committed.

- `dialecte handover run <folder>` is what `commit.sh` runs. Each guard prints one line with its result
  and its time (`✓ snapshot    110 file(s)  0.4 s`): repository, the lots file as reviewed, hooks
  folder, branch, HEAD, empty index, the files against the snapshot, deleted files, files outside the
  lots, plan tags and citations. When the staged files are exactly the next lot's (a run stopped after
  staging it), the index guard prints the command that unstages them, with its `cd`.
  Then `lot n/N` with its files and subject, the commit's hook output behind `│`, a heartbeat every 30 s
  while the hook is silent (`… hook running 2 m 10 s`; after three silent beats it asks whether the hook
  waits for input or runs in watch mode), the commit with its stat; the total time and the card at the
  end. A lot whose `git add` or commit fails is unstaged again: once the cause is fixed, the same command
  finds the lots already committed on top of the recorded HEAD (same message, same paths, same content)
  and resumes at the next one; anything else on top of HEAD is refused with what was found. It never
  pushes. `--rehearse` runs the lots in a scratch clone that looks like your tree - the repository at
  HEAD, your working tree on top, the hooks folder, a copy-on-write copy of `node_modules` - so the hooks
  run as they will for real; the clone is removed at the end (`--keep` keeps it), and on Ctrl-C or
  SIGTERM, with the hook and every process it started stopped. The clone's git folder holds a marker
  naming the process that made it (`dialecte-rehearsal.json`).
- `dialecte handover list [--root <dir>] [--json]` lists every hand-over folder under the workspace's
  `_commit-plan/` (or the folder given, or the current one): repository, worktree, branch, lots, age, and
  its state - pending, partly committed, committed, or stale when something else moved the branch. A
  folder holding a hand-written `commit*.sh` and no lots file shows as "legacy script, state unknown".
- `dialecte worktree add <repository> <branch> [--from <ref>] [--json]` makes a worktree under the
  workspace's `.worktrees/<repository>-<branch tail>` (the last segment of the branch: `core-depth` for
  `feat/depth`; a new branch starts from `--from`, else the base
  branch): it copies the hooks folder `core.hooksPath` names (husky's `.husky/_` is ignored by git, so a
  plain worktree misses it), copies the main checkout's `node_modules` copy-on-write where the file system
  can (links kept, a relative link to a sibling re-pointed so it still reaches it), and writes the hygiene
  baseline `gate --fast` compares with; it prints a card.
- `dialecte worktree prune [--root <workspace>] [--yes] [--json]` lists, per repository of the workspace,
  the worktrees and local branches whose commits are all in the base branch, the hand-over folders whose
  lots are all committed (never `_commit-plan` itself, nor a folder holding other folders) and the
  rehearsal clones whose process is gone, with the command that removes each (its absolute `cd` first).
  `--yes` runs them after a confirmation on a terminal; without a terminal it refuses, so hand the
  commands (or the `--yes` command) to a person. Kept, each with why: an unmerged branch; the branch the
  main checkout is on; a worktree a hand-over is pending in, or with uncommitted changes; a branch whose
  reflog still reaches commits the base does not hold (reset onto a newer base after commits of its own:
  its reflog is the only way back to them); a worktree or branch with no commit of its own in its reflog
  (just made); a worktree holding ignored files that removing it would delete (anything but
  `node_modules`, `dist`, `.vitepress/cache`, `.vitepress/dist`, `.DS_Store` and the hooks folder; a long
  list is counted, the first three named); a rehearsal clone whose process still runs, or without a
  marker. It reads each worktree with `git --no-optional-locks`, so it never rewrites an index.

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
(`DIALECTE_CORE_DIR=../core npm run test:run`); with neither they fail. The lockfile gains that
devDependency at the release, once core 0.8.0 is published.

The cli does not re-declare core's types: the definition, record, diagnostic, error, expectation and reader shapes
(`ResolvedDefinition`, `DataType`, `AttributeDefinition`, `AnyDialecteConfig`, `ChildOccurrences`, `Diagnostic`,
`DialecteError`, `Expectation`, the readers of `@dialecte/core/utils`...) are `import type` from the `@dialecte/core`
devDependency, which is erased from the build (the bin loads at run time the core each dialecte resolves, and
`isCoreReaders` checks it holds the readers). Until core 0.8.0 is published, link a core build:
`ln -s <core checkout> node_modules/@dialecte/core` (built: `npm run build` there). Types the cli narrows, because a
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
