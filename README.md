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
dialecte doctor            # versions, core API generation, skills in sync, local checkouts
dialecte rules             # code-rules self-check of the changed files
dialecte gate [--full]     # the package's Definition of Done, with the real counts
dialecte new verb <namespace> <query|transaction> <name>
dialecte handover <lots.json>   # the guarded commit-by-lots script a human runs
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

Run outside a package (no `package.json`), each answers a usage error.

## Developing the cli

The `schema` tests drive `@dialecte/core`'s own test dialecte through core's own readers: they resolve core
from the `@dialecte/core` devDependency, or from the built core checkout `DIALECTE_CORE_DIR` names
(`DIALECTE_CORE_DIR=../core npm run test:run`); with neither they fail. The lockfile gains that
devDependency at the release, once core 0.8.0 is published.

## Contributing to a Dialecte package

Four commands for whoever changes a Dialecte package, a person or an agent. Each answers the same way
every time: exit 0 when green, 1 when a check fails, 2 on a usage error; `--json` where a program reads
the answer.

- `dialecte rules [<files...>] [--json]` checks the code rules on the syntax tree of the changed files
  (or the files given): exported types outside a `*.types.ts` file, module constants outside a
  `*.constants.ts` file, functions declared as `const`, an `await` inside an argument, plan tags and
  standard citations are errors; positional parameters (beyond a leading `query` / `tx`, a symmetric
  pair aside) and abbreviated names are warnings.
- `dialecte gate [--fast | --full] [--json]` runs the Definition of Done: `--fast` (default) `check`,
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
- `dialecte handover <lots.json> [--out <dir>] [--rehash]` writes the commit-by-lots script a human
  runs. The lots file names the repository, the branch and HEAD expected, and the lots (paths, message):

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

  It refuses (and writes nothing) when the branch or HEAD differ, something is staged, a changed file
  is in no lot or in two, or a lot file (evals included) or message holds a plan tag or a standard
  citation. It prints each lot with its size and snapshot hash, and writes `commit.sh` (bash, also run
  with `sh`), which checks all of it again when it runs, plus the files against the snapshot. Edited
  a file after the review? `--rehash`. The repository stays locked for `dialecte gate` until the script
  has committed; the script never pushes.

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
	"referencePatterns": ["SPEC-[0-9]+"]
}
```

`gate.fast` / `gate.full` replace the default steps of that mode (`counts: "tests"` makes a step fail
when it counts no test; `changedOnly: true` marks a step that runs only the tests the change affects,
so "No test files found" passes with a note instead of failing; `restoresGeneratedDocs: true` restores the `generatedDocs` byte for byte after
it); `referencePatterns` adds the package's own patterns (extended regular expressions) to the plan
tags and citations `rules` and `handover` refuse.

## How it fits the ecosystem

| Package                            | Bin               | Audience                 | Phase    |
| ---------------------------------- | ----------------- | ------------------------ | -------- |
| `@dialecte/create`                 | `create-dialecte` | new-dialect authors      | scaffold |
| **`@dialecte/cli`**                | **`dialecte`**    | **dialect authors / CI** | **dev**  |
| `@dialecte/core` · `@dialecte/scl` | —                 | libraries                | runtime  |
