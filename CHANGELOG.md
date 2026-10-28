# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- `--help` (or `-h`) after any command prints the help and runs nothing: `dialecte bench --help` no longer runs the bench and rewrites the baseline.

### Changed

- `@xmldom/xmldom` (exact version) is a devDependency: the `fixture` tests parse the documents they check in Node with it. The test workflow installs `xmllint` (`libxml2-utils`): the `fixture` tests judge every document of core's test dialecte against the XSD core ships.

- **Breaking:** needs Node 22.18 or later (`engines`): `dialecte run` loads `.ts` scripts through Node's built-in type stripping.
- `@dialecte/core` (`^0.8.0`) is a devDependency: the `schema`, `run` and `explain` tests drive its test dialecte (`DIALECTE_CORE_DIR` overrides it with a local build). The lockfile picks it up at the release, once core 0.8.0 is published.
- `coverage` writes its temporary discovery file under `node_modules/.cache/dialecte/`, out of reach of formatters, linters and git.

### Added

- `dialecte mcp`: a stdio MCP server exposing the read-only lookups as tools (`api_find`, `api_show`, `schema`, `members`, `doctor`, `models`), each answering what its command answers with `--json`; a failed lookup is an error result, and every tool takes an optional `cwd`. Adds `@modelcontextprotocol/sdk` as a dependency; the README shows the configuration for Claude Code, Copilot in VS Code, Codex and Gemini CLI.
- `dialecte models [--vendor <id>] [--json]`: which model each tier (`fast`, `standard`, `strong`, `frontier`) means for the vendor the project uses (anthropic, openai, google), with the date the rows were checked and what each tier is for, so agents name a tier and never a model. `dialecte skills sync` detects the vendor from the project (`.claude/`, `AGENTS.md` + `.codex/`, `.gemini/`; Copilot and Cursor host several vendors), asks on a terminal when it cannot tell, and remembers it as `vendor` in every `.dialecte-skills.json` of the project; `--vendor <id>` sets it without asking. A folder holding only the skills a sync wrote is no evidence of an agent. Without a terminal, only a first sync (no manifest) with nothing detected exits 2 naming `--vendor`; a project that already has a manifest and an ambiguous or empty detection keeps syncing without a vendor and is told how to set it.
- `dialecte skills sync`: installs the agent skills your dependencies ship in `skills/<name>/` into `.claude/skills` and `.agents/skills` (`--agent claude,copilot,agents`, `--copy` instead of links, `--from <folder>` to take them from local checkouts). Only what it installed is ever replaced or removed. Its manifest records the package and version each skill came from.
- `dialecte run <script.ts>`: runs a module script (its default export gets `{ project, doc, documentId, dialecte, helpers, utils }`) against an in-memory project of the installed dialecte and answers one outcome - the thrown error as code, key, detail, `meta` and the element's path, the input's import diagnostics, the operations per tag, what the script returned. `--in` imports a file first, `--out` writes the result, `--prepare` stages the first transaction and commits nothing (its operations and its callback's report), `--expect <file>` checks a JSON array of `{ tag, where?, under?, count? }` and names each one not met with the count found. Ids are seeded (`--seed`), `--now` freezes the clock: the same script, input and seed give the same outcome. `--json`, `--package`, `--timeout`. Exit 1 when the run failed or an expectation is not met. Records are counted as each commit merges them. Under `--prepare` every other write is refused and fails the run, even caught (a second transaction, a prepared commit, another document's transaction, the project's writes and raw database); in every mode a callback may not call `tx.commit`, `tx.finishStaging` or `tx.clearStagedOperations`. Needs `@dialecte/core` 0.8.0.
- `dialecte fixture <Tag> [--under A/B] [--package <name>] [--out <file>] [--json]`: the smallest XML document holding an element that is valid against the dialecte's full schema - structure, values, identity and references - built by the installed dialecte's engine with its hooks: the chain of parents from the root (the shortest, or the `--under` path), every child required on the way and the first branch of every required choice, the first variant of an element of an abstract type, a value for every required attribute and for text an empty value does not satisfy (fixed, default, else the first value the type takes, every facet checked: enumeration, pattern, length, range), each sampled value new in the document so unique and key fields never repeat, and for every reference a keyref checks the element it points at - one already planned when the values can meet, else one planted along the key's selector. The document is the plain export, without record-id marks. Ids are seeded and the clock frozen: the same command gives the same bytes. Exit 1 with the reason when there is none: an unknown tag (the closest named), a `--under` step its parent does not hold, a value it cannot make (the attribute named), a reference it cannot plant (the constraint named), a write the engine refuses. Needs `@dialecte/core` 0.8.0 (`requiredChoices`).
- `dialecte explain <code | key>`: what an error or diagnostic code means, when it is raised, the usual fix and the docs page, from the catalogues of the installed core and dialecte. `--json`; exit 1 for a code no catalogue knows.
- `dialecte skills generate`: rewrites the generated blocks of your skills from the source: verb map of your extensions, core method index, hook files, and the API index (`api`: every method with its JSDoc summary and `@intent` tags; `intents`: "when you need to... → use").
- `dialecte api find "<need>"` and `dialecte api show <path>`: find a method by what you need and read its contract (signature, summary, intents, routes, where it is declared, a call a caller can copy) from the `api.json` the installed packages ship, without the repositories. Methods rank by the words of the need their intents hold, then their summary, then their name.
- `dialecte members <expression>`: what `doc.query`, `doc.query.reference` or `tx.lifecycle.extract` hold, from the live types of your package, one line per member.
- `dialecte schema <Tag>`: parents, children with how often each may appear, attributes with their rules, text and xsi:type variants of an element of an installed dialecte, read through the core that dialecte resolves; an unknown tag answers the closest tag names.
- `dialecte doctor`: installed `@dialecte/*` versions, the core API generation of each dialecte (a warning when one runs on another core than your app), synced skills against node_modules (missing skills, copies of another version), local checkouts; each warning with the command that fixes it.
- `dialecte skills generate` writes `api.json` next to the page holding the API index, with each method's declared signature and one call: its JSDoc `@example` when short and calling the method, else a test call without test scaffolding in its arguments; `skills check` fails when it is missing or stale.
- `dialecte rules`: the code-rules self-check on the syntax tree of the changed files (or the files given): types outside `*.types.ts`, module constants outside `*.constants.ts`, functions declared as `const`, an `await` inside an argument, plan tags and standard citations are errors; positional parameters and abbreviated names are warnings. `--json` for a program.
- `dialecte gate [--fast | --full]`: runs the package's Definition of Done step by step, unfiltered, and judges each step on its exit code and the counts it printed (a test step that counts no test fails; on a change that touches no test, `--fast` passes its changed-tests step with a note). Steps come from `"dialecte": { "gate" }` in package.json or the defaults; `generatedDocs` are restored byte for byte after the docs build. Refuses to run while a hand-over script holds the repository.
- `dialecte new verb <namespace> <query|transaction> <name>`: scaffolds an extension verb of a dialecte package in the house style, with its types, a red table-driven test, its barrel export and its namespace registration.
- `dialecte handover <lots.json>`: writes the guarded commit-by-lots script a human runs (branch, HEAD, empty index, snapshot hashes, files outside the lots, plan tags and standard citations in files and messages), and locks the repository for `gate` until it has committed. `--rehash` after an edit.
- `dialecte skills check` refuses a method whose JSDoc summary or `@intent` still holds the `FILL:` placeholder `new verb` writes.
- `dialecte skills check`: fails when a skill cites an API, a path or an npm script that does not exist, links to a missing page, has invalid frontmatter or a stale generated block, or when a public method the package defines has no JSDoc summary or no `@intent` tag. It warns when a summary or an intent quotes a sentence, since the generated pages republish the JSDoc. `--workspace <folder>` also verifies pages that describe several repositories.

## [0.1.0] - 2026-10-14

### Changed

- **Breaking:** `coverage` reads enumerations from the attribute's datatype, as `@dialecte/create` 0.1 writes them: regenerate your dialecte, then your coverage files.

## [0.0.3] - 2026-09-29

### Fixed

- `bench` measures only your own types: library declaration files are skipped, so a library's typing or a library error no longer moves the numbers. Regenerate your baseline once with this version.
