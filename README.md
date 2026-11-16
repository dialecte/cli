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

Every command has its page in [`doc/commands/`](doc/commands/index.md): the help the cli prints, generated from the
command map (`npm run doc:generate`), then what the command does in full. The index lists the commands by family
and the forms renamed in 1.0.

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

## What the cli prints

Every text the cli prints passes one boundary: each printed line is escaped once, so a value from a record, a
brief, an argument or an agent can never forge a line nor act on the terminal. Every C0 control (a tab and a line
feed included), DEL, the C1 controls, the bidi marks, embeddings, overrides and isolates and the line and
paragraph separators print as `\u{<hex>}` (`\u{a}` for a line feed, `\u{1b}` for an escape). A lot verb's
refusal, a recap row, a card line and an error the cli catches all print that way. Quoted source (`lot delta`'s
diff, `mutants judge`'s window) shows a tab as four spaces. `--json` is never escaped: JSON encodes its control
characters itself and holds every value as written. The lines the cli relays from its own child processes (a
gate step's, a hook's, a test runner's) keep their colours (SGR sequences, the conceal parameter dropped);
every other control in them is escaped.

## Lookups for agents (and people)

Each answers in a few lines, the same with or without the Dialecte repositories, and takes `--json`.
Exit codes: 0 an answer, 1 nothing found (or a warning for `doctor`), 2 a usage error.

The lookups: [`api`](doc/commands/api.md), [`members`](doc/commands/members.md), [`schema`](doc/commands/schema.md), [`explain`](doc/commands/explain.md), [`doctor`](doc/commands/doctor.md), [`models`](doc/commands/models.md).

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
  repository) and `rules` and `handover` refuse them as whole words (`consumer tool name`). The words a
  contributor never commits at all are listed on the machine the same way, never in the repository:
  `git config --global dialecte.forbiddenWords "<word>, <word>"` and the user file
  `$XDG_CONFIG_HOME/dialecte/forbidden-words` (else `~/.config/dialecte/forbidden-words`; one word per line,
  `#` comments, blank lines skipped), both read and merged. `rules`, `contrib` (its rules row) and the hand-over's
  `references` guard (lot messages and files) refuse them as whole words, whatever the case (`forbidden word`).
  With no list anywhere the check is not run and `rules` says so in one line,
  `forbidden words: no list (git config dialecte.forbiddenWords or <the user file>)`, and passes (a CI machine has
  no list); a user file that cannot be read (a folder at its path, no read permission) is an error, never no list.
  A gate or contrib record of a run that checked the rules is keyed with a hash of the consumer names and the
  forbidden words (never the words), so a list set or changed after a green record runs the check again.
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
  `dialecte lot standard <id|folder> consulted <note> | not-consulted <reason> | outside <note>`.

## Contributing to a Dialecte package

Twelve commands for whoever changes a Dialecte package, a person or an agent. Each answers the same way
every time: exit 0 when green, 1 when a check fails, 2 on a usage error; `--json` where a program reads
the answer.

Each has its page: [`rules`](doc/commands/rules.md), [`gate`](doc/commands/gate.md), [`contrib`](doc/commands/contrib.md), [`tdd`](doc/commands/tdd.md), [`new`](doc/commands/new.md), [`handover`](doc/commands/handover.md), [`worktree`](doc/commands/worktree.md), [`lot`](doc/commands/lot.md), [`inbox`](doc/commands/inbox.md), [`health`](doc/commands/health.md), [`plan`](doc/commands/plan.md), [`mutants`](doc/commands/mutants.md), [`changelog`](doc/commands/changelog.md), [`text`](doc/commands/text.md).

### The base branch

Every command that reads the base branch (the gate's base, `mutants`, `tdd`, `worktree add` and `worktree prune`,
`lot close`, the hand-over's target) finds it the same way, the first rule that answers winning:

1. `dialecte.baseBranch` when set (an optional override). Set to a branch that
   exists nowhere, it is refused, never replaced by another (a package without a `dialecte.gate` config too: its
   default lists hold the scoped `rules` step): exit 2 for the gate's base, `mutants`, `handover write`
   and `handover run`, exit 1 for `worktree add` of a new branch without `--from`; the commit hook fails, and the
   tdd step of `gate --full` fails with the same text.
2. The branch `origin/HEAD` names (recorded at clone), when that branch exists.
3. `main`.
4. `master`.
5. Nothing found: refused with `no base branch found (no dialecte.baseBranch, no origin/HEAD, no main, no master):
   name it as dialecte.baseBranch in package.json`. The gate alone keeps selecting everything (with a note) in that
   case; `worktree add` without `--from` refuses, `worktree prune` skips the repository with the text, `lot close`
   holds nothing through the base, and `tdd` measures from HEAD.

Each rule reads the branch where it is newest: the local branch or origin's, whichever is ahead of the other, and
origin's when they diverged. The remote is the truth: a merge queue lands on the host, so a local base branch goes
stale. `worktree add` (without `--from`) fetches origin before it cuts the branch, and `lot close` fetches it and
fast-forwards the local base branch (merged in the main checkout when it is checked out there and clean, its ref
moved otherwise; a line says when it does not move). A fetch that fails says so and the last known refs are read. A
lot's own branch is always read locally.

The repository field of `package.json` is a URL and is never read for this. `mutants` finds `origin/<b>` through
the same rule and no longer takes a tag named like the base branch.

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

The cli gates itself with its own `dialecte.gate` (package.json). `--fast`: `check`, a scoped `tests` step
(`node src/scoped-tests.ts`: `vitest related` over the paths changed between the gate base and the tree that a
test can import, and an empty selection exits 0 without starting vitest; a changed path no test can import - the
manifest, the entry, the vitest config, a setup file, a file a test reads - is left to the full suite on CI, said in
one line) and a scoped `rules` step on the same changed list. Its commit hook (`dialecte.gate.hook`) runs `check`
and that scoped `tests` step; the full suite runs on CI for every pull request. `--full`: the default full steps (`check`, `skills`, `build`, the whole suite), then `rules` on the
changes since the gate base. The suite's setup file also points `XDG_CONFIG_HOME` at a folder that does not exist
(no person's forbidden words list is read) and sets `DIALECTE_KEEP_AWAKE=0` (no run of the suite holds the machine
awake); a case that wants either sets it itself.

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
