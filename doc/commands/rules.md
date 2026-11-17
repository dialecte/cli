# dialecte rules

<!-- dialecte-reference: generated from the command map by npm run doc:generate; edit the map, not this block -->

Code-rules self-check of the changed files (syntax tree, not greps)

```text
rules - Code-rules self-check of the changed files (syntax tree, not greps)

  dialecte rules [<files...>] [--json]

  types / constants in their files, named functions, no await in an argument, object parameters,
    full words, no standard citation (nor, in a contributor profile, a plan tag, acceptance
    criterion or ticket number); temporary-root-shared; raw-git-repository on test and test support
    files (a git clone / git init argument list in a git call, init --bare aside: make the
    repository through a test helper that gives it an identity; allowable); bare-tmpdir on
    production files (every temporary folder under one scratch root; allowable); their messages name
    the cli helpers only in the cli
  a contributor: no consumer name nor forbidden word (git config dialecte.forbiddenWords and
    $XDG_CONFIG_HOME/dialecte/forbidden-words, else ~/.config/dialecte/forbidden-words; whole words,
    any case); no list: one line, and the check is not run
  without files: the changed list a scoped gate step hands (DIALECTE_GATE_CHANGED), else the files
    changed against HEAD and the new ones; a file it cannot read or parse is an error
  quality rules: argument-mutation, query-in-loop, long-function on implementation files;
    table-branch, without-export-xml, export-without-queries, fixture-builder, plan-tag on
    test-shaped files; on test-shaped Dialecte changes: xml-splice, xml-replace, transaction-spy,
    act-repeats-call, act-snapshot, act-format-check, inline-document-long, expected-fixture,
    fixture-case-comment (warning), test-file-long, fixture-file-long, fixtures-module,
    fixture-builder an error; in an app only Dialecte-change script files are judged, the others
    counted in one line (a contributor package is never an app); with the gate base, an error on a
    line the change did not add is a warning; without a gate base, or with an empty-tree one (as
    gate --release hands), the order every caller shares: the recorded base of the store lot, else
    the merge-base with the base branch (skipped, for an empty-tree base and for a run without a
    gate base, when it is the commit of HEAD), else the last release tag <name>@v<version>, else no
    base and every error kept; a run without a gate base prints one line naming it (rules: base
    <sha> (the lot <name> | the merge-base with <branch> | the merge-base with the base branch | the
    release tag <tag>))
  changelog-edit (an error), in a package keeping a changes/ folder: CHANGELOG.md edited without the
    package version bumped; write the entry in changes/<lot>.md (dialecte changelog)
  --json: dialecteChanges (the verdict of each file), notJudged, baseLine; described by
    rules.schema.json (schema 1)
  opt-out: // dialecte-allow <rule>[, <rule>]: <reason> (15 characters at least) on the line or the
    line before (for argument-mutation, long-function also in the comments before the function, its
    doc comment included; for act-repeats-call, act-snapshot, act-format-check inside an act also
    the line before the act); fixture-file-long: <!-- dialecte-allow fixture-file-long: <reason> -->
    on the first line of the fixture; invalid-allow, unused-allow; --json counts the findings
    silenced per rule in allowed
  an API index that cannot be read: query-in-loop does not run, one line names the file and why
  not judged: an alias of a parameter or of a query (aliases are not followed); query-in-loop is
    syntactic and one level (a read in a function the loop calls is not seen); a table imported from
    a sibling file; plan-tag flags round, step or station followed by a number in a title (reword
    it, or opt out); fixture-builder reads a <word> placeholder in a template string as XML (opt
    out); act-repeats-call counts a call after an early-return arm that makes the same call as two;
    a *Query-named binding that is no query, or a run with no readable API index (no core groups),
    can make a unit of a call chain

e.g. dialecte rules src/commands/lot.ts
```

Flags: `--json`
<!-- /dialecte-reference -->

- `dialecte rules [<files...>] [--json]` checks the code rules on the syntax tree of the changed files
  (or the files given): exported types outside a `*.types.ts` file, module constants outside a
  `*.constants.ts` file, functions declared as `const`, an `await` inside an argument, standard
  citations and the package's `referencePatterns` (and, in a contributor, plan tags, acceptance criteria
  and ticket numbers: see [Profiles](../../README.md#profiles)) are errors, and so is a test that takes the system's temporary folder itself as
  its root (`tmpdir()` handed to a call that lists or scans a folder, or given as `root` / `cwd` /
  `scratchRoot`...: other tests and processes share it; `mkdtempSync(join(tmpdir(), '<prefix>-'))`
  gives the test a folder of its own), and so is a test or test support file that runs `git clone` or `git init`
  itself (`raw-git-repository`: a `git clone` / `git init` argument list in a git call, a `'git'` program or a shell
  string starting with `git`, `init --bare` aside: such a repository has no identity, green where git falls back to
  user@host and red on a CI machine; make it through a test helper that gives it an identity); so is a production
  file that calls `tmpdir()` (`bare-tmpdir`: every temporary folder under one scratch root the package cleans;
  allowable). Both messages name the cli's own helpers only when the checked package is the cli
  (`cloneRepository` / `initializeRepository` of `test/scratch-repository.ts`; `makeScratchFolder`, whose
  `src/lib/scratch/` is exempt): in core or a dialecte those helpers are not there;
  positional parameters (beyond a leading `query` / `tx`, a
  symmetric pair aside) and abbreviated names are warnings. A file it cannot read (a file given that is not
  there, no read permission) or a script that does not parse is an error of that file (`unreadable-file`),
  never a silent skip. Without file arguments it reads the changed list a scoped gate step hands
  (`DIALECTE_GATE_CHANGED`: its text files still on disk; a list it cannot read is an error) and writes the
  gate's selection (the files it checked); outside a gate, the files changed against HEAD and the new ones,
  that result recorded in the worktree's git folder (`dialecte-rules.json`: when, HEAD, the state hash, the
  files, the errors and warnings), which `dialecte lot recap` reads; a run on named files records nothing.
  Quality rules, on implementation files (a test-shaped file is exempt):
  - `argument-mutation` (error): a function changes what a parameter refers to (a mutating method such as
    `.push` or `.add`, an assignment to a property, `delete`, `++`, `Object.assign` with it first); return the
    new value instead. Rebinding the parameter, a copy, a write through `query` / `tx`, a `reduce` accumulator
    are not flagged. A write through `this` (`this.x = ...`, `this.items.push(...)`, `delete this.x`, `this.n++`) is
    one too, in a class the `class` rule does not admit (an opted-out class included); the constructor and static
    blocks build, they are not judged, and `this` inside a nested `function` or class is not the instance's.
  - `class` (error): functional first, a class passes only when a package entry exports it (a typed public
    facade: the `exports` map of `package.json`, its sources followed through `export *`, `export * as`,
    `export { a as b } from`, an imported name exported again and `export default`; type-only exports count), it
    `implements` an interface (a store), or it is an `Error` subclass holding only fields and a constructor.
    Inferred from the code, no config. Any other class is an error, kept only with
    `// dialecte-allow class: <why>`; else write functions over explicit state.
  - `query-in-loop` (error): a query read (a method of the API indexes' `q` entries, `perf` and writes aside)
    called on a query binding inside a loop or a loop callback (`map`, `forEach`, ...); read them in one query
    before the loop. A call through a `perf` segment (`doc.query.perf.getRecord()`) is never a query read. Without an API index the rule does not run.
  - `long-function` (warning): a function body over 60 lines that are neither blank nor comment-only; split it.

  Test-shape rules, on test-shaped files (a test file, a name ending `-fixtures.ts`, `.test-fixtures.ts` or
  `-cases.ts`, a file under the package's top-level `test/` folder):
  - `table-branch` (error): an act or a per-case callback branches on a field of its case; one table per
    behaviour.
  - `without-export-xml` (error): a `.withoutExport(` act reads exported XML; use `withExport` with
    `expectedQueries`.
  - `export-without-queries` (error): a case of a `.withExport(` table with no (or empty) `expectedQueries`
    and `unexpectedQueries`; give it one.
  - `fixture-builder` (warning): a function returns XML built with a substitution (a value inside the XML, or
    the element name itself: `` `<${tag} .../>` ``); write each fixture as inline XML.
  - `plan-tag` (error): a title, a table key or the file name carries a plan or round tag; say what the case
    checks.

  An opt-out silences `raw-git-repository`, `bare-tmpdir` or one of these nine rules: `// dialecte-allow <rule>[, <rule>]: <reason>`, the reason at
  least 15 characters, on the finding's line or the line before it (for `argument-mutation`, `class`
  and `long-function`, also anywhere in the comments right before the function or class, its doc comment included). A
  malformed opt-out, a rule it cannot silence or a reason too short is an `invalid-allow` error; an opt-out
  that covers no finding is an `unused-allow` warning (never for a rule that did not run). `--json` (and the
  rules record) counts the findings the opt-outs silenced, per rule, in `allowed`. With the gate base (a
  scoped gate step), an error of these rules on a line the change did not add is a warning ending
  `(not added by this change)`. An empty-tree gate base (the release list, or no base branch found) knows no
  change, so it takes the one order every caller shares: the recorded base of the store lot whose worktree holds
  the package, else the base branch's merge-base with HEAD (for this empty-tree request, a merge-base equal to
  HEAD's commit knows no change and is skipped, on a branch or detached), else the package's last release tag `<name>@v<version>` reachable from HEAD (only the lines added
  since that release count), else every error is kept: no empty-tree softening. A plain `rules` run (no gate
  base) keeps them errors. An API index that cannot be read (not JSON, a skill shipped twice) fails
  nothing: `query-in-loop` does not run and one line names the file and why. Not judged: an alias of a
  parameter (`const set = params.items; set.add(x)`), a read in a function the loop calls (`query-in-loop` is
  syntactic: it sees the reads written inside the loop), a table imported from a sibling file. `plan-tag`
  flags `round` or `step` followed by a number in a title (`step 2 of the import`): reword it, or opt out.
  `fixture-builder` reads `<` followed by a letter as XML, so a returned text with a `<word>` placeholder and a
  substitution (`` `usage: <name> ${value}` ``) is flagged too: opt out with the reason.
