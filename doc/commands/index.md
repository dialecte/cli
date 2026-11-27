# dialecte commands

<!-- dialecte-reference: generated from the command map by npm run doc:generate; edit the map, not this block -->

## Discover

| Command                            | What it does                                                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`dialecte api`](api.md)           | Find a method by what you need (find), read its contract (show)                                                                                         |
| [`dialecte members`](members.md)   | The members of an expression of the live types (doc.query, tx.lifecycle)                                                                                |
| [`dialecte schema`](schema.md)     | What an element may hold and where: parents, children, attributes                                                                                       |
| [`dialecte explain`](explain.md)   | What an error or diagnostic code means, when it is raised, the usual fix                                                                                |
| [`dialecte standard`](standard.md) | Index and search the standards kept on this machine (DIALECTE\_STANDARD: one folder per standard); the index lives in the cache                         |
| [`dialecte facts`](facts.md)       | List, show and forget the facts the agents recorded, kept in the data folder (one ledger per person, never in a repository)                             |
| [`dialecte ask`](ask.md)           | Answer a question about a dialecte: a fact recorded before, the definition, the catalogues and api indexes, else the slices of the standard for readers |

## Use

| Command                          | What it does                                                                                 |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| [`dialecte run`](run.md)         | Run a script against an in-memory project of the installed dialecte; one structured outcome  |
| [`dialecte fixture`](fixture.md) | The smallest valid XML document holding an element, built by the installed dialecte's engine |
| [`dialecte new`](new.md)         | Scaffold in the house style                                                                  |

## Grow

| Command                        | What it does                                                                                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| [`dialecte lot`](lot.md)       | A lot: started from a brief into the lot store, its declaration .dialecte/lot.json, and its review rounds in its lot or hand-over folder     |
| [`dialecte inbox`](inbox.md)   | What waits on someone across every lot store: health findings, questions for a person, questions for a caller, ready hand-overs, failed lots |
| [`dialecte health`](health.md) | What went wrong lately across every lot store: duplicate work, slow landings, stalled runs, idle worktrees and leaked scratch folders        |

## Plan

| Command                    | What it does                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| [`dialecte plan`](plan.md) | What can start now in a plan's lot block, whether the block is valid, a mark on an entry |

## Check

| Command                              | What it does                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| [`dialecte gate`](gate.md)           | The package's Definition of Done with the real counts                                                  |
| [`dialecte tdd`](tdd.md)             | Receipts that each new test failed on an assertion before the code, then passed untouched              |
| [`dialecte rules`](rules.md)         | Code-rules self-check of the changed files (syntax tree, not greps)                                    |
| [`dialecte contrib`](contrib.md)     | The contributor checks of a dialecte package (profile contributor)                                     |
| [`dialecte changelog`](changelog.md) | Changelog fragments (changes/&lt;lot&gt;.md): check them, or fold them into CHANGELOG.md for a release |
| [`dialecte ci`](ci.md)               | The CI files shipped as a template: write them into the package, report drift, run the publish guard   |
| [`dialecte mutants`](mutants.md)     | Mutation testing of the declared scope; survivors tracked until handled                                |

## Hand over

| Command                            | What it does                                                        |
| ---------------------------------- | ------------------------------------------------------------------- |
| [`dialecte handover`](handover.md) | The guarded commit-by-lots hand-over a human runs, from a lots file |

## Workspace

| Command                                  | What it does                                                                            |
| ---------------------------------------- | --------------------------------------------------------------------------------------- |
| [`dialecte orchestrate`](orchestrate.md) | The read-only orchestrator state of a workspace                                         |
| [`dialecte worktree`](worktree.md)       | A worktree ready to work in; prune what a merge left                                    |
| [`dialecte doctor`](doctor.md)           | Installed versions, core API generation, skills in sync, local checkouts                |
| [`dialecte models`](models.md)           | Which model each tier (fast, standard, strong, frontier) means for the project's vendor |
| [`dialecte skills`](skills.md)           | Agent skills shipped in skills/&lt;name&gt;/: sync \| generate \| check \| changed      |
| [`dialecte corpus`](corpus.md)           | The open-licence corpora fetched into a cache, and the licensed ones of config.yml      |

## Maintain

| Command                              | What it does                                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| [`dialecte bench`](bench.md)         | Measure the type-instantiation cost of the change against its base (tsc --extendedDiagnostics); --check to gate it |
| [`dialecte coverage`](coverage.md)   | Generate type-coverage probes (surface, valid calls, deep, full method surface with extensions)                    |
| [`dialecte narrowing`](narrowing.md) | Gate: assert schema-derived type narrowing still holds (IntelliSense safety net)                                   |
| [`dialecte audit`](audit.md)         | Render the public type surface and flag readability issues (C1-C6)                                                 |
| [`dialecte text`](text.md)           | The human part of a host text, before it is posted                                                                 |

## Renamed in 1.0

| 1.0                                                                                                                                 | Before                     |
| ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `dialecte lot finding <id\|folder> --round <n> --severity <blocking\|should-fix\|nit> --at <file:line> <finding>`                   | `dialecte record review`   |
| `dialecte lot decide <id\|folder> <finding> <open \| fix-to-verify \| fixed <round> [note] \| accepted <reason> \| logged <where>>` | `dialecte record decision` |
| `dialecte lot snapshot <id\|folder> --round <n> [--beyond-cap --by <who> --reason <text>]`                                          | `dialecte record snapshot` |
| `dialecte lot choice <id\|folder> --by <who> <decision>`                                                                            | `dialecte record choice`   |
| `dialecte lot standard <id\|folder> consulted <note> \| not-consulted <reason> \| outside <note>`                                   | `dialecte record standard` |
| `dialecte lot delta <id\|folder> --round <n> [--worktree] [--json]`                                                                 | `dialecte review delta`    |
| `dialecte lot recap <id\|folder>`                                                                                                   | `dialecte recap`           |

<!-- /dialecte-reference -->

The review rounds' commands moved under `lot`. The old forms run nothing and write nothing: each answers
`renamed: dialecte <old> is now dialecte <new>` on stderr, exit 2, until 2.0. Its second line is the full new
command with the same arguments, or, with no arguments, the new form's usage line; `record` or `review`
without a verb lists every form that replaced it. Asked with `--help`, an old form prints the same answer on
stdout, with the words given before `--help`, exit 0; with `--help --json` it prints
`{ renamed: [{ old, new }] }`, the words after `dialecte` (`record` lists its five forms).

`dialecte handover write <lots.json>` names what `dialecte handover <lots.json>` does; the old form stays.
