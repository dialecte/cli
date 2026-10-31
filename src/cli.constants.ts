/** The `dialecte` commands and the help text the cli prints. */
import { run as api } from './commands/api.ts'
import { run as audit } from './commands/audit.ts'
import { run as bench } from './commands/bench.ts'
import { run as coverage } from './commands/coverage.ts'
import { run as doctor } from './commands/doctor.ts'
import { explain } from './commands/explain.ts'
import { run as fixture } from './commands/fixture.ts'
import { run as gate } from './commands/gate.ts'
import { run as handover } from './commands/handover.ts'
import { run as lot } from './commands/lot.ts'
import { run as members } from './commands/members.ts'
import { run as models } from './commands/models.ts'
import { run as narrowing } from './commands/narrowing.ts'
import { run as newVerb } from './commands/new-verb.ts'
import { run as record } from './commands/record.ts'
import { run as review } from './commands/review.ts'
import { run as rules } from './commands/rules.ts'
import { run as runScript } from './commands/run.ts'
import { run as schema } from './commands/schema.ts'
import { run as skills } from './commands/skills.ts'
import { run as tdd } from './commands/tdd.ts'
import { run as worktree } from './commands/worktree.ts'

export const COMMANDS: Record<string, (argv: string[]) => Promise<void>> = {
	coverage,
	bench,
	narrowing,
	audit,
	skills,
	api,
	schema,
	members,
	models,
	doctor,
	run: runScript,
	fixture,
	explain,
	rules,
	gate,
	tdd,
	new: newVerb,
	handover,
	lot,
	worktree,
	record,
	review,
}

export const HELP = `
dialecte — TypeScript type-performance & readability tooling for Dialecte dialects

Usage:
  dialecte <command> [options]

Commands:
  coverage   Generate type-coverage probes (surface + valid calls + deep + full method surface incl. extensions)
  bench      Measure type-instantiation cost (tsc --extendedDiagnostics); --check to gate CI
  narrowing  Gate: assert schema-derived type narrowing still holds (IntelliSense safety net)
  audit      Render the public type surface and flag readability issues (C1–C6)
  skills     Agent skills shipped in skills/<name>/: sync | generate | check
  api        Find a method by what you need (find), read its contract (show)
  members    The members of an expression of the live types (doc.query, tx.lifecycle)
  schema     What an element may hold and where: parents, children, attributes
  models     Which model each tier (fast, standard, strong, frontier) means for the project's vendor
  doctor     Installed versions, core API generation, skills in sync, local checkouts
  run        Run a script against an in-memory project of the installed dialecte; one structured outcome
  fixture    The smallest valid XML document holding an element, built by the installed dialecte's engine
  explain    What an error or diagnostic code means, when it is raised, the usual fix
  rules      Code-rules self-check of the changed files (syntax tree, not greps)
  gate       The package's Definition of Done with the real counts: --fast (default) | --full
  tdd        Receipts that each new test failed on an assertion before the code, then passed untouched
  new        Scaffold in the house style: new verb <namespace> <query|transaction> <name>
  handover   The guarded commit-by-lots hand-over a human runs, from a lots file: write | run | list
  lot        The lot declaration .dialecte/lot.json: exempt | accept <case> | revised <case|file|glob> | gone <file|glob>, each with a reason
  worktree   A worktree ready to work in (hooks, node_modules, hygiene baseline); prune what a merge left
  record     A lot's review rounds in its hand-over folder: review | decision | snapshot
  review     The fix diff since the previous round's snapshot: delta

Zero-config: namespace = capitalized package name, versions discovered from src/<version>/definition/.
Core is detected by package name and benched via a built-in test dialect. Override per package.json
"dialecte" field (odd layouts) or CLI flags:
  --namespace <Name>  --entry <import>  --constants-dir <dir>  --out <dir>  --version <v>  --tsconfig <f>

Emitted files are formatted with the consumer's oxfmt (matches that package's style):
  --format-config <path>   oxfmt config to use (default: auto-discover the nearest .oxfmtrc)
  --no-format              skip formatting the generated output

Examples:
  dialecte coverage            # regenerate the coverage probes
  dialecte bench               # measure + write benchmarks/types/baseline.json
  dialecte bench --check       # CI gate: fail on >5% instantiation regression
  dialecte audit               # write benchmarks/types/readability-audit.md

Skills:
  dialecte skills sync [--agent claude,copilot,agents] [--copy] [--from <workspace>] [--vendor <id>] [--no-session-check]
                             # install the skills of your dependencies (or of local checkouts) for your agents;
                             # remembers the model vendor (detected, asked on a terminal, or --vendor) for models;
                             # for Claude Code also writes the station agents (.claude/agents/dialecte-*.md) and a
                             # SessionStart hook running doctor --brief (--no-session-check leaves it out)
  dialecte skills generate   # rewrite the generated blocks (verb map, method index, hook files) from the source
  dialecte skills check [--workspace <dir>]
                             # fail on a cited API / path / npm script that does not exist, or a stale block

Lookups (the same with or without the repositories; --json on each):
  dialecte api find "<need>" [--package <name>] [--limit 5]
                             # methods whose intents, summary or name match the need, best first
  dialecte api show <path>   # signature, summary, intents, routes, declaration, example (info.of, tx.addChild)
  dialecte members <expression>
                             # one line per member of doc.query, doc.query.reference, tx.lifecycle.extract...
  dialecte schema <Tag> [--package <name>]
                             # parents, children with how often, attributes; an unknown tag answers the closest
  dialecte models [--vendor <anthropic|openai|google>] [--json]
                             # the model each tier means for the vendor (exit 2: no vendor known, 1: unknown vendor)
  dialecte doctor            # what to fix before trusting what you read; exit 1 on a warning
  dialecte doctor --brief    # the session-start form: nothing when in sync, one line per problem, always exit 0

MCP server: see @dialecte/mcp (npx @dialecte/mcp)

Run:
  dialecte run <script.ts> [--in <file>] [--out <file>] [--prepare] [--expect <file>]
               [--seed <n>] [--now <iso>] [--package <name>] [--timeout <ms>] [--json]
                             # the script's default export gets { project, doc, documentId, dialecte, helpers, utils };
                             # ids seeded, --prepare stages the first transaction and commits nothing,
                             # --expect checks a JSON array of { tag, where?, under?, count? }; exit 1 on failure
  dialecte fixture <Tag> [--under A/B] [--package <name>] [--out <file>] [--json]
                             # the chain from the root (or --under), required children and attributes, hooks applied;
                             # the same bytes every time; an unknown tag answers the closest (exit 1)
  dialecte explain <code | key> [--package <name>] [--json]
  Node 22.18+: .ts scripts run through Node's built-in type stripping.

Contributing (inside a dialecte repository):
  dialecte rules [<files...>] [--json]
                             # types / constants in their files, named functions, no await in an argument,
                             # object parameters, full words, no plan tag or standard citation
  dialecte gate [--fast | --full] [--no-wait] [--declare <path>]... [--json]
                             # steps from package.json "dialecte": { "gate", "generatedDocs" } or the defaults;
                             # refuses while a hand-over script holds the repository; --fast starts with the
                             # worktree's hygiene (nothing staged, no stash on its branch, new files declared);
                             # --full and heavy steps hold the machine lock (waits, or refuses with --no-wait)
  dialecte tdd red [<test file>]... [--no-wait] [--json]
                             # every case of the changed test files: a failure on an assertion (or a stub's
                             # 'not implemented', a TypeError of existing code, inside an asserting expect) is a
                             # red; a new or changed case that passes, a missing export, a type or syntax error, a
                             # timeout, a .only is refused; one refusal records no red of its file; the files
                             # without a refusal are frozen, and the changed helpers, fixtures, snapshots a
                             # red or revised case of theirs depends on; a revised entry may name a proven
                             # case or an edited case of the base
  dialecte tdd green [<test file> | <test file>::<case name>]...
                             # each case with a red receipt, its test code as frozen, production changed since
                             # its red, passes; records a green receipt
  dialecte tdd status [--json] [--flags]
                             # per case: red, green, unchanged, missing receipt, test edited after red, flags;
                             # test code changed outside tdd red; cases the change deletes (an untitled test
                             # call of the base in a file a "gone" entry names: gone, with its reason)
  dialecte new verb <namespace> <query|transaction> <name> [--version <v>]
                             # verb, types, red test (only: true), barrel export, namespace registration
  dialecte handover <lots.json> [--out <dir>] [--rehash] [--json]
                             # the hand-over folder (lots.json, snapshot, one-line commit.sh) and its card;
                             # refuses files in no lot, tags, citations, a missing core.hooksPath folder
  dialecte handover run <folder> [--rehearse [--keep]] [--resume-merge]
                             # what commit.sh runs: each guard with its time, each lot announced (a spinner on
                             # a terminal), the hook live, its full log, the card; a rerun resumes; --rehearse
                             # commits in a scratch clone; a real run that commits every lot moves
                             # .dialecte/lot.json into the folder as lot.json and leaves {} in its place
  dialecte handover list [--root <dir>] [--json]
                             # every hand-over folder: repository, worktree, branch, lots, age, state
  dialecte lot exempt <reason> | lot accept <case> <reason> | lot revised <case|file|glob> <reason>
  dialecte lot gone <file|glob> <reason>
                             # writes .dialecte/lot.json at the package root (tab JSON), keeping the rest;
                             # a case is <file>::<name>; a file or glob covers every case of its files
  dialecte worktree add <repository> <branch> [--from <ref>] [--json]
                             # under the workspace's .worktrees/: hooks folder, copy-on-write node_modules,
                             # hygiene baseline
  dialecte worktree prune [--root <workspace>] [--yes] [--json]
                             # merged worktrees and branches, committed hand-overs, rehearsal clones: the
                             # commands with their cd; --yes runs them after a confirmation on a terminal
                             # (a fresh worktree, ignored files, an unmerged branch are kept)
  dialecte record review <folder> --round <n> --severity <blocking|should-fix|nit> --at <file:line> <finding>
                             # appends R<n>-<k> open to <folder>/findings-ledger.md (made when absent)
  dialecte record decision <folder> <id> <open | fix-to-verify | fixed <round> [note] | accepted <reason> | logged <where>>
                             # rewrites that finding's state cell, every other byte kept
  dialecte record snapshot <folder> --round <n>
                             # copies what git status lists to round-<n>/, the deletions to round-<n>.deleted,
                             # HEAD to round-<n>.base; the hand-over folder stays outside every repository;
                             # a nested repository or a submodule is refused; -- ends the options of each
  dialecte review delta <folder> --round <n> [--worktree] [--json]
                             # per file, the diff from round-<n-1>/ to the worktree now; --worktree adds a
                             # throwaway worktree holding round n-1 and prints its removal command

Env: RUNS=5 dialecte bench   (repetitions for the min); COVERAGE_CHILD_CAP=N (cap edges)
`
