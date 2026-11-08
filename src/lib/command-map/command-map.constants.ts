/** The declared map of the commands: family, summary, usage lines, exit codes and one example each. */
import { lotFormsOf } from '../review-rounds/review-round-verbs.ts'

import type { CommandFamily, CommandMap } from './command-map.types.ts'

/** The families, in the order the help prints them. */
export const COMMAND_FAMILIES: readonly CommandFamily[] = [
	'Discover',
	'Use',
	'Grow',
	'Check',
	'Hand over',
	'Workspace',
	'Maintain',
]

/** The first line of the global help. */
export const GLOBAL_HELP_TITLE = 'dialecte - the Dialecte cli: discover, use and grow a Dialecte'

/** The lines under the families: where the rest of the help is. */
export const GLOBAL_HELP_FOOTER = [
	'dialecte <command> --help      that command only',
	'dialecte --help --json         every command, verb, flag and exit code',
] as const

/**
 * The flags of the zero-config commands (coverage, bench, narrowing, audit), each with its value: the global
 * notes print them, and a usage line's `[zero-config flags]` stands for them.
 */
export const ZERO_CONFIG_FLAGS = {
	overrides: [
		'--namespace <Name>',
		'--entry <import>',
		'--constants-dir <dir>',
		'--out <dir>',
		'--version <v>',
		'--tsconfig <f>',
	],
	formatting: ['--format-config <path>', '--no-format'],
} as const

/** What a usage line writes in place of the zero-config flags. */
export const ZERO_CONFIG_USAGE = '[zero-config flags]'

/** A flag of a usage line: `--name`, not inside a word. */
export const USAGE_FLAG_PATTERN = /(?<![\w-])--[a-z][a-z0-9-]*/g

/** A verb: a bare lowercase word (`finding`, `no-reuse`), not a placeholder, a file name or a flag. */
export const VERB_SHAPE_PATTERN = /^[a-z][a-z-]*$/

/** What holds for every command, after the footer of the global help. */
export const GLOBAL_HELP_NOTES = [
	'Exit codes: 0 an answer or green, 1 nothing found or a failed check, 2 usage or refused;',
	'a command says when it differs. --help or -h before -- prints that command only, runs nothing.',
	'',
	'Zero-config (coverage, bench, narrowing, audit): namespace = capitalized package name, versions',
	'from src/<version>/definition/; core is benched through a built-in test dialect. Override in the',
	'package.json "dialecte" field or with flags:',
	`  ${ZERO_CONFIG_FLAGS.overrides.join('  ')}`,
	`Generated files are formatted with the package's oxfmt: ${ZERO_CONFIG_FLAGS.formatting.join(' | ')}.`,
	'Env: RUNS=5 dialecte bench (repetitions for the min); COVERAGE_CHILD_CAP=N (cap child edges).',
] as const

/** The width the family names are padded to on their line of the global help. */
export const FAMILY_COLUMN_WIDTH = 12

/** The space between the commands of a family's line. */
export const FAMILY_COMMAND_SEPARATOR = '  '

/** The indentation of a section's usage lines, notes, exit codes and example. */
export const SECTION_INDENT = '  '

/** The most columns a note line of a section takes, its indentation included. */
export const NOTE_WIDTH = 100

/** The start of a note about one verb or flag (`run - ...`): its continuation lines hang under the text after it. */
export const NOTE_VERB_PATTERN = /^\S+ - /

/** The headings of a command section. */
export const SECTION_HEADINGS = {
	exitCodes: 'exit codes:',
	example: 'e.g.',
} as const

/** The words every usage line of a command starts with, before the command's name. */
export const USAGE_PREFIX = 'dialecte '

/** Every command, in family order; `record`, `review` and `recap` only say what replaced them. */
export const COMMAND_MAP: CommandMap = {
	api: {
		family: 'Discover',
		summary: 'Find a method by what you need (find), read its contract (show)',
		usage: [
			'dialecte api find "<need>" [--package <name>] [--limit 5] [--json]',
			'dialecte api show <path> [--package <name>] [--json]',
		],
		notes: [
			'find - the methods whose intents, summary or name match the need, best first',
			'show - signature, summary, intents, routes, declaration, example (info.of, tx.addChild)',
		],
		exitCodes: [],
		example: 'dialecte api find "add a child element"',
	},
	members: {
		family: 'Discover',
		summary: 'The members of an expression of the live types (doc.query, tx.lifecycle)',
		usage: ['dialecte members <expression> [--package <name>] [--version <v>] [--json]'],
		notes: [
			'one line per member of doc.query, doc.query.reference, tx.lifecycle.extract...; in an app, of the installed dialecte (--package / --version when several)',
		],
		exitCodes: [],
		example: 'dialecte members doc.query',
	},
	schema: {
		family: 'Discover',
		summary: 'What an element may hold and where: parents, children, attributes',
		usage: ['dialecte schema <Tag> [--package <name>] [--json]'],
		notes: ['parents, children with how often, attributes; an unknown tag answers the closest'],
		exitCodes: [],
		example: 'dialecte schema Bay',
	},
	explain: {
		family: 'Discover',
		summary: 'What an error or diagnostic code means, when it is raised, the usual fix',
		usage: ['dialecte explain <code | key> [--package <name>] [--json]'],
		notes: [],
		exitCodes: [],
		example: 'dialecte explain CONCURRENT_TRANSACTION',
	},
	standard: {
		family: 'Discover',
		summary:
			'Index and search the standards kept on this machine (DIALECTE_STANDARD: one folder per standard); the index lives in the cache',
		usage: [
			'dialecte standard index [--standard <id>] [--package <name>] [--rebuild] [--json]',
			'dialecte standard find "<terms>" [--standard <id>] [--package <name>] [--about <Tag>] [--limit <n>] [--json]',
			'dialecte standard show <file id>:<from>-<to> [--json]',
			'dialecte standard eval <gold.jsonl> [--standard <id>] [--package <name>] [--json]',
		],
		notes: [
			'the vocabulary - the tags, attributes and enumeration values of the installed dialectes (--package <name>: that one only); index, find and eval print it first',
			'index - builds (or reuses) the index of each standard folder, prints its quality per file',
			'find - the ranked slices of whole lines that hold the terms, then the clauses they refer to [linked]; --about <Tag> adds a tag of the installed dialectes',
			'show - the normalised text of a range of original lines; a file id is <standard id>/<file name without .md>',
			'eval - recall at 5 and 10 of find over a local gold file of { question, about?, expected: [{ file, quote }] } lines; the expected quotes are alternatives',
			'the standard is never copied into a repository: its index is in $XDG_CACHE_HOME/dialecte (else ~/.cache/dialecte)',
		],
		exitCodes: [
			'1  index: no indexable file · find: nothing matched · show: only blank or dropped lines · eval: no item with an expected quote · a file changed during the build',
			'2  usage · no standard configured · a root or cache inside a git work tree · colliding ids · an unknown standard, file, --package or --about tag',
		],
		example: 'dialecte standard find "data object" --limit 5',
	},
	run: {
		family: 'Use',
		summary:
			'Run a script against an in-memory project of the installed dialecte; one structured outcome',
		usage: [
			'dialecte run <script.ts> [--in <file>] [--out <file>] [--prepare] [--expect <file>]',
			'dialecte run <script.ts> [--seed <n>] [--now <iso>] [--package <name>] [--timeout <ms>] [--json]',
		],
		notes: [
			"the script's default export gets { project, doc, documentId, dialecte, helpers, utils }; ids seeded",
			'--prepare - stages the first transaction and commits nothing',
			'--expect - checks a JSON array of { tag, where?, under?, count? }',
			"Node 22.18+: .ts scripts run through Node's built-in type stripping",
		],
		exitCodes: ['1  the script failed or an expectation was not met'],
		example: 'dialecte run add-part.ts --in assembly.xml --expect expected.json',
	},
	fixture: {
		family: 'Use',
		summary:
			"The smallest valid XML document holding an element, built by the installed dialecte's engine",
		usage: ['dialecte fixture <Tag> [--under A/B] [--package <name>] [--out <file>] [--json]'],
		notes: [
			'the chain from the root (or --under), required children and attributes, hooks applied; the same bytes every time; an unknown tag answers the closest',
		],
		exitCodes: [],
		example: 'dialecte fixture AAA_1 --package @dialecte/core/test',
	},
	new: {
		family: 'Use',
		summary: 'Scaffold in the house style',
		usage: ['dialecte new verb <namespace> <query|transaction> <name> [--version <v>]'],
		notes: ['verb, types, red test (only: true), barrel export, namespace registration'],
		exitCodes: [],
		example: 'dialecte new verb parts query findPart',
	},
	lot: {
		family: 'Grow',
		summary:
			'A lot: its declaration .dialecte/lot.json, and its review rounds in its hand-over folder',
		usage: [
			'dialecte lot exempt <reason>',
			'dialecte lot accept <case> <reason>',
			'dialecte lot revised <case|file|glob> <reason>',
			'dialecte lot gone <file|glob> <reason>',
			'dialecte lot mutation <off|changed|audit|gate>',
			'dialecte lot finding <folder> --round <n> --severity <blocking|should-fix|nit> --at <file:line> <finding>',
			'dialecte lot decide <folder> <id> <open | fix-to-verify | fixed <round> [note] | accepted <reason> | logged <where>>',
			'dialecte lot snapshot <folder> --round <n>',
			'dialecte lot choice <folder> --by <who> <decision>',
			'dialecte lot standard <folder> consulted <note> | not-consulted <reason>',
			'dialecte lot delta <folder> --round <n> [--worktree] [--json]',
			'dialecte lot recap <folder>',
			'dialecte lot close <hand-over name|index>... [--json]',
		],
		notes: [
			'exempt|accept|revised|gone|mutation - write .dialecte/lot.json at the package root (tab JSON), keeping the rest',
			'accept - a case is <file>::<name>',
			'revised - a file or a glob covers every case of its files',
			'mutation - absent: changed when the diff touches the declared scope, off otherwise; gate = changed that the hand-over waits for',
			'finding - appends R<n>-<k> open to <folder>/findings-ledger.md (made when absent)',
			"decide - rewrites that finding's state cell, every other byte kept",
			'snapshot - copies what git status lists to round-<n>/, the deletions to round-<n>.deleted, HEAD to round-<n>.base; the folder stays outside every repository; -- ends the options',
			'choice - appends | decision | who | yyyy-mm-dd | to <folder>/decisions.md (made when absent)',
			"standard - writes <folder>/standard.json (state, note, time), read by the card's standard line",
			'delta - per file, the diff from round-<n-1>/ to the worktree now; --worktree adds a throwaway worktree holding round n-1 and prints its removal command',
			"recap - the <details> part of a pull request from the hand-over's records only; writes nothing",
			"close - for a committed or abandoned hand-over of the registry (by name or index): its worktree moved to .worktrees/_trash/ and removed in the background, its node_modules parked in .worktrees/_pool-<repository>-<n>; kept with why when it is the main checkout, on another branch than the hand-over's, locked, dirty, a process or a mutation run works there, lot close itself runs from inside it, or the processes are not known; the branch never touched; exit 1 when one is kept, 2 for a name or index the registry does not hold",
		],
		exitCodes: [],
		example:
			'dialecte lot finding ../handover --round 1 --severity nit --at src/a.ts:3 "a finding"',
	},
	gate: {
		family: 'Check',
		summary: "The package's Definition of Done with the real counts",
		usage: [
			'dialecte gate [--fast | --full] [--base <ref>] [--no-reuse] [--declare <path>]... [--json]',
			'dialecte gate --hook [--no-reuse]',
		],
		notes: [
			'steps from package.json "dialecte": { "gate", "generatedDocs" } or the defaults; --full then runs npm run type-narrowing when the package has that script and no step runs it (a skip line when it lacks it); refuses while a hand-over script holds the repository',
			"--fast - the default; starts with the worktree's hygiene (nothing staged, no stash on its branch, new files declared)",
			'a failing vitest test step is rerun once, serially, on its failing files: passing there it is flagged flaky in parallel',
			'a green record of the same tree, install and steps answers the steps after a fresh tdd step; --no-reuse runs them',
			'--hook - in a commit hook, the test steps of --full, unless a green --full record of the committed tree, install and steps answers them',
		],
		exitCodes: [],
		example: 'dialecte gate --full',
	},
	tdd: {
		family: 'Check',
		summary:
			'Receipts that each new test failed on an assertion before the code, then passed untouched',
		usage: [
			'dialecte tdd red [<test file>]... [--json]',
			'dialecte tdd green [<test file> | <test file>::<case name>]...',
			'dialecte tdd status [--json] [--flags] | tdd status --legend',
		],
		notes: [
			"red - every case of the changed test files must fail on an assertion (or a stub's 'not implemented' inside an asserting expect); a passing new case, a missing export, a type or syntax error, a timeout, a .only is refused; the files without a refusal are frozen",
			'green - each case with a red receipt, its test code as frozen, production changed since its red, passes; records a green receipt',
			'status - per case red, green, unchanged, missing receipt, test edited after red, flags',
			'--legend - the tdd terms of the hand-over card',
		],
		exitCodes: [],
		example: 'dialecte tdd green',
	},
	rules: {
		family: 'Check',
		summary: 'Code-rules self-check of the changed files (syntax tree, not greps)',
		usage: ['dialecte rules [<files...>] [--json]'],
		notes: [
			'types / constants in their files, named functions, no await in an argument, object parameters, full words, no standard citation (nor, in a contributor profile, a plan tag, acceptance criterion or ticket number)',
		],
		exitCodes: [],
		example: 'dialecte rules src/commands/lot.ts',
	},
	contrib: {
		family: 'Check',
		summary: 'The contributor checks of a dialecte package (profile contributor)',
		usage: ['dialecte contrib [--no-reuse] [--json]'],
		notes: [
			'after gate --full and before handover: rules on the changed files, the "dialecte": { "contrib": { "steps" } } (default: npm run doc:build with the generatedDocs restored, npm run type-bench:check), npm run type-narrowing when the package has that script and no step runs it (a skip line when it lacks it), no dependency named by a local folder, the mutation line when a scope is declared',
			'a step a green gate --full of this tree and install passed with the same command is not run again; --no-reuse runs every row',
		],
		exitCodes: ['2  refused in a consumer (nothing written)'],
		example: 'dialecte contrib',
	},
	mutants: {
		family: 'Check',
		summary: 'Mutation testing of the declared scope; survivors tracked until handled',
		usage: [
			'dialecte mutants run [--mode changed|audit] [--base <ref>]',
			'dialecte mutants status [--json]',
			'dialecte mutants schedule <follow-up> <key>... | schedule <follow-up> --all-new [--json]',
			'dialecte mutants abandon <run id> [--json]',
			'dialecte mutants migrate [--json]',
			'dialecte mutants judge [--file <file>] [--json]',
			'dialecte mutants record (--key <key>... | --file <file>) --family <family> --reason <text> [--removable] [--json]',
			'dialecte mutants drop <run id> [--json]',
		],
		notes: [
			'run - Stryker on package.json "dialecte": { "mutation" }; changed = the scope lines changed since the merge base, audit = the whole scope; without --mode the lot\'s switch decides',
			'status - running runs with their age, died runs, new survivors by lot, scheduled by follow-up',
			'judge - per file, the new survivors with the code around each, its covering tests, a family guess',
			'record - writes .dialecte/mutation-records.json, then moves the survivors to recorded',
		],
		exitCodes: ['1  run: only when Stryker fails, never on survivors'],
		example: 'dialecte mutants run --mode changed',
	},
	handover: {
		family: 'Hand over',
		summary: 'The guarded commit-by-lots hand-over a human runs, from a lots file',
		usage: [
			'dialecte handover write <lots.json> [--out <dir>] [--rehash] [--json]',
			'dialecte handover show [<name|folder>] [--json]',
			'dialecte handover run [<name|folder>] [--rehearse [--keep] [--full]] [--resume-merge]',
			'dialecte handover abandon [<name|folder>]',
			'dialecte handover list [--root <dir>] [--json]',
			'dialecte handover --legend',
		],
		notes: [
			'write - the hand-over folder (lots.json, snapshot, one-line commit.sh) and its card, registered in <git common dir>/dialecte-handover/<name>.json; handover <lots.json> is the same',
			'show - the card again, recomputed, nothing written; without an argument the newest of the branch',
			'run - what commit.sh runs: each guard with its time, each lot announced, the hook live, the card; without a folder the one registered hand-over still to run; --rehearse commits in a scratch clone',
			'abandon - marks a hand-over that will not run (abandoned.json) and releases its lock',
			'list - every hand-over folder: repository, worktree, branch, lots, age, state',
			'--legend - every term of the card, what it means, whether to look',
		],
		exitCodes: [],
		example: 'dialecte handover write ../handover/lots.json',
	},
	worktree: {
		family: 'Workspace',
		summary: 'A worktree ready to work in; prune what a merge left',
		usage: [
			'dialecte worktree add <repository> <branch> [--from <ref>] [--json]',
			'dialecte worktree prune [--root <workspace>] [--yes] [--json]',
		],
		notes: [
			"add - under the workspace's .worktrees/: hooks folder, the links its file: and link: dependencies need to sibling checkouts, node_modules taken from the pool when an entry matches package-lock.json (else a copy-on-write copy), read against package-lock.json (the npm ci to run when it differs), hygiene baseline",
			'prune - merged worktrees and branches, committed hand-overs, rehearsal clones: the commands with their cd; --yes runs them after a confirmation on a terminal; the pool (.worktrees/_pool-<repository>-<n>) and the trash (.worktrees/_trash/) are counted, never touched',
		],
		exitCodes: ['0  add: the worktree exists, whatever the links and the lockfile say'],
		example: 'dialecte worktree add cli feat/my-change',
	},
	doctor: {
		family: 'Workspace',
		summary: 'Installed versions, core API generation, skills in sync, local checkouts',
		usage: ['dialecte doctor [--json]', 'dialecte doctor --brief'],
		notes: [
			'what to fix before trusting what you read',
			'--brief - the session-start form, nothing when in sync, one line per problem',
		],
		exitCodes: ['1  a warning', '0  --brief, always'],
		example: 'dialecte doctor --brief',
	},
	models: {
		family: 'Workspace',
		summary:
			"Which model each tier (fast, standard, strong, frontier) means for the project's vendor",
		usage: ['dialecte models [--vendor <anthropic|openai|google>] [--json]'],
		notes: [],
		exitCodes: ['1  an unknown vendor', '2  no vendor known'],
		example: 'dialecte models --vendor openai',
	},
	skills: {
		family: 'Workspace',
		summary: 'Agent skills shipped in skills/<name>/: sync | generate | check | changed',
		usage: [
			'dialecte skills sync [--agent claude,copilot,agents] [--copy] [--from <workspace>] [--contributing | --no-contributing] [--vendor <id>] [--no-session-check]',
			'dialecte skills generate [zero-config flags]',
			'dialecte skills check [--workspace <dir>] [zero-config flags]',
			'dialecte skills changed [--base <ref>]',
		],
		notes: [
			'sync - install the consumer skills of your dependencies (or of local checkouts) for your agents; --contributing adds the contributor skills, remembered until --no-contributing; remembers the model vendor; with the contributor skills, a doctor --brief session-start check in AGENTS.md and the station agents (--no-session-check leaves the check out)',
			'generate - rewrite the generated blocks (verb map, method index, hook files) from the source',
			'check - fail on a cited API / path / npm script / cli invocation that does not exist, or a stale block',
			'changed - per skill, hand-written change (evals due) or generated blocks only',
		],
		exitCodes: [],
		example: 'dialecte skills sync --agent claude',
	},
	bench: {
		family: 'Maintain',
		summary: 'Measure type-instantiation cost (tsc --extendedDiagnostics); --check to gate CI',
		usage: ['dialecte bench [--check] [zero-config flags]'],
		notes: [
			'writes benchmarks/types/baseline.json; --check fails on a >5% instantiation regression',
		],
		exitCodes: [],
		example: 'dialecte bench --check',
	},
	coverage: {
		family: 'Maintain',
		summary:
			'Generate type-coverage probes (surface, valid calls, deep, full method surface with extensions)',
		usage: ['dialecte coverage [zero-config flags] [--format-config <path> | --no-format]'],
		notes: [],
		exitCodes: [],
		example: 'dialecte coverage',
	},
	narrowing: {
		family: 'Maintain',
		summary: 'Gate: assert schema-derived type narrowing still holds (IntelliSense safety net)',
		usage: ['dialecte narrowing [zero-config flags]'],
		notes: [],
		exitCodes: [],
		example: 'dialecte narrowing',
	},
	audit: {
		family: 'Maintain',
		summary: 'Render the public type surface and flag readability issues (C1-C6)',
		usage: ['dialecte audit [zero-config flags] [--format-config <path> | --no-format]'],
		notes: ['writes benchmarks/types/readability-audit.md'],
		exitCodes: [],
		example: 'dialecte audit',
	},
	text: {
		family: 'Maintain',
		summary: 'The human part of a GitHub text, before it is posted',
		usage: ['dialecte text check <file> [--kind pr|issue|comment|commit]'],
		notes: [
			'the lines before <details: headings What changes, Why, How to check it (then Watch out) for pr and issue, none for comment and commit; word cap 150 | 200 | 80 | 100, headings and code blocks not counted; a commit subject of 72 at most',
		],
		exitCodes: [],
		example: 'dialecte text check pr.md --kind pr',
	},
	record: { renamedTo: lotFormsOf('record') },
	review: { renamedTo: lotFormsOf('review') },
	recap: { renamedTo: lotFormsOf('recap') },
}
