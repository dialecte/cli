/** The declared map of the commands: family, summary, usage lines, exit codes and one example each. */
import { renamedEntriesOf } from '../review-rounds/review-round-verbs.ts'

import type { CommandFamily, CommandMap } from './command-map.types.ts'

/** The families, in the order the help prints them. */
export const COMMAND_FAMILIES: readonly CommandFamily[] = [
	'Discover',
	'Use',
	'Grow',
	'Plan',
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
			'dialecte api find "<need>" [--source] [--package <name>] [--limit 5] [--json]',
			'dialecte api show <path> [--package <name>] [--json]',
			'dialecte api show <file>#<name> [--json]',
		],
		notes: [
			'find - the methods whose intents, summary or name match the need, best first',
			'show - signature, summary, intents, routes, declaration, example (info.of, tx.addChild)',
			'--source - also the exported functions of the own package src/ (show src/lib/git.ts#readGit), cached in the git folder',
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
		usage: ['dialecte schema <Tag> [--under <Parent>] [--package <name>] [--json]'],
		notes: [
			'parents, children with how often, attributes, type, documentation; an unknown tag answers the closest',
			'a tag declared several ways is printed per declaration, with the parents holding each; --under <Parent> picks the one that parent holds',
		],
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
	facts: {
		family: 'Discover',
		summary:
			'List, show and forget the facts the agents recorded, kept in the data folder (one ledger per person, never in a repository)',
		usage: [
			'dialecte facts list [--about <Tag>] [--state <state>|all] [--json]',
			'dialecte facts show <id> [--json]',
			'dialecte facts forget <id> --reason <text> [--json]',
		],
		notes: [
			'the ledger is $XDG_DATA_HOME/dialecte/facts (else ~/.local/share/dialecte/facts): one file per fact (F-<n>.json) and its history (F-<n>.history.jsonl); nothing is ever deleted',
			"list - every question's current fact, whatever its state; --state valid | stale | unverifiable | unchecked | forgotten: the current facts in that state now; orphan: the fact files no question points to; all: every fact file, superseded and unreadable ones included; --about <Tag>: the facts about that tag",
			"states - valid; stale (a source moved since: a standard's files, a dialecte's definition); unverifiable (a source cannot be compared now); unchecked (from outside the documents, or a person's answer given without them); forgotten",
			'show - the question, the answer, its source and effort, its state now, its sources, how many pieces of evidence, and its history in order',
			'forget - marks the fact forgotten, its reason in the history (cut at 200 characters); the file is kept; forgetting it again writes nothing',
		],
		exitCodes: [
			'1  show, forget: no fact of that id (the closest ids named) or a fact file that is not readable JSON',
			'2  usage · the ledger inside a git work tree (set XDG_DATA_HOME to a folder outside the repository)',
		],
		example: 'dialecte facts list --state stale',
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
			'A lot: started from a brief into the lot store, its declaration .dialecte/lot.json, and its review rounds in its lot or hand-over folder',
		usage: [
			'dialecte lot start <brief.json> [--effort low|medium|high] [--dry-run] [--simulate <scenario>] [--json]',
			'dialecte lot status <id> [--json]',
			'dialecte lot wait <id> [--timeout <seconds>] [--json]',
			'dialecte lot answer <id> <question> "<answer>" [--by <who>] [--json]',
			'dialecte lot result <id> [--json]',
			'dialecte lot stop <id> --reason <text> [--by <who>] [--json]',
			'dialecte lot station <id> start <station> [--step <n>] [--round <n>] [--attempt <n>] [--agent <name>] [--executor host|command] [--vendor <name>] [--model <name>] [--tier <name>] [--effort <word>] [--session <id>] [--skill <name|path>]... [--skill-asked <name|path>]... [--event <id>] [--json]',
			'dialecte lot station <id> end <station> [--run <run>] [--step <n>] [--round <n>] [--attempt <n>] [--agent <name>] [--vendor <name>] [--model <name>] [--tier <name>] [--effort <word>] [--session <id>] [--skill <name|path>]... [--skill-asked <name|path>]... [--event <id>] [--tokens-in <n>] [--tokens-out <n>] [--tokens-cache-read <n>] [--tokens-cache-write <n>] [--tokens-total <n>] [--money <amount> <currency>] [--duration <seconds>] [--exit <n>] [--verdict <word>] [--suite <name>=<runs>]... [--json]',
			'dialecte lot station <id> --from <file.json> [--json]',
			'dialecte lot exempt <reason>',
			'dialecte lot accept <case> <reason>',
			'dialecte lot revised <case|file|glob> <reason>',
			'dialecte lot gone <file|glob> <reason>',
			'dialecte lot mutation <off|changed|audit|gate>',
			'dialecte lot finding <id|folder> --round <n> --severity <blocking|should-fix|nit> --at <file:line> <finding>',
			'dialecte lot decide <id|folder> <finding> <open | fix-to-verify | fixed <round> [note] | accepted <reason> | logged <where>>',
			'dialecte lot snapshot <id|folder> --round <n>',
			'dialecte lot choice <id|folder> --by <who> <decision>',
			'dialecte lot standard <id|folder> consulted <note> | not-consulted <reason>',
			'dialecte lot delta <id|folder> --round <n> [--worktree] [--json]',
			'dialecte lot recap <id|folder>',
			'dialecte lot report <id> [--json]',
			'dialecte lot report --feature <name> [--simulated] [--json]',
			'dialecte lot export <id> <dir> [--json]',
			'dialecte lot close <hand-over name|index>... [--json]',
		],
		notes: [
			'start - checks the brief (every refusal at once, exit 2), claims the next index, publishes the lot folder in <git common folder>/dialecte-lots/, makes the numbered worktree at the base commit with its .dialecte/lot link; --dry-run checks (the store list included), names the lot and the start to run next, writing nothing; exit 1 when the worktree cannot be made (the lot failed, nothing removed, next: lot stop); a link that cannot be made leaves the lot working with a note; every --json exit is JSON, a usage error { error, usage, next: null } included',
			'--simulate - start a simulated lot that plays one of the scenarios (ready, question, person, two-questions, limit, failure, slow) under wait: no worktree, no branch, no registry entry; it never blocks a real lot',
			'status - the state derived from the lot records (working, input-required, ready, committed, canceled, failed), the worktree and link checks, and the exact next command (and an also: line); a lot whose records do not hold reads damaged with its reason and next: lot stop (exit 6); reads only; exit 2 for an unknown or ambiguous id',
			'wait - returns the status as soon as the lot needs someone (exit 0 ready or committed, 1 failed or canceled, 3 input-required, 4 a limit) or --timeout is reached (5); a damaged lot at once (6); a real lot is read every second and nothing written, a simulated lot is played to its next blocking point, and answered at once when nothing is left to play (5 while it works)',
			'answer - records the answer to an open question once (the same answer again: already); a person question needs --by <who>; a damaged lot takes none (exit 2); runs the onAnswered hooks; next: lot wait',
			'result - never blocks, writes nothing: a ready or committed lot gives its hand-over (card, show and run lines), worktree, branch and answered questions; failed or canceled the last reason (exit 1); input-required the open questions (3); working exit 5; damaged exit 6',
			'stop - ends the lot: refused once committed; a pending hand-over is abandoned first (refused while its run is in progress), then a canceled transition with the reason and --by (caller without it); already canceled exits 0 writing nothing; moves no worktree and deletes nothing; a damaged lot has its folder moved to <git common folder>/dialecte-lots-aside/ with a stopped.json (refused while a live run marker holds it), its index kept claimed',
			"station - appends one station event (by: host) to the lot's events.jsonl, never rewriting a line: start answers its run and the end command; end pairs with --run, else with the one open start of its station, step, round and attempt (several: refused), else repeats the last such end carrying a cost field with the same fields (already, nothing written), else is recorded alone (started: null); --event <id> again answers the first event (already) or is refused when its fields differ; start is refused on a committed, canceled or failed lot, end is accepted in every state; a simulated lot writes simulated: true; text fields refuse control, line-break and direction characters, vendor, model, tier, effort and session at most 80 characters, step, round and attempt 1-999, tokens, runs and duration non-negative, at most 50 skills (hash: sha256 of the path or of the synced <folder>/<name>/SKILL.md, else null), a verdict of approve, back, fix-then-repass, fixed, disagreed, answered, failed, limit; a line over 4,096 bytes is refused; --from takes the same fields plus phase (start|end) as one JSON object, unknown keys refused, every fault at once; --json { recorded: new|already, run, next }",
			'--by - one line, not empty, checked before the lot is read (answer and stop)',
			'<id> - an index (171 = 0171), a full name, a lot folder or .dialecte/lot; a write verb needs an index unique across every store of the store list, a word naming an existing folder is that folder',
			'exempt|accept|revised|gone|mutation - write .dialecte/lot.json at the package root (tab JSON), keeping the rest',
			'accept - a case is <file>::<name>',
			'revised - a file or a glob covers every case of its files',
			'mutation - absent: changed when the diff touches the declared scope, off otherwise; gate = changed that the hand-over waits for',
			'finding - appends R<n>-<k> open to <folder>/findings-ledger.md (made when absent)',
			"decide - rewrites that finding's state cell, every other byte kept",
			'snapshot - copies what git status lists to round-<n>/, the deletions to round-<n>.deleted, HEAD to round-<n>.base; the folder is a lot folder or stays outside every repository; -- ends the options',
			'choice - appends | decision | who | yyyy-mm-dd | to <folder>/decisions.md (made when absent)',
			"standard - writes <folder>/standard.json (state, note, time), read by the card's standard line",
			'delta - per file, the diff from round-<n-1>/ to the worktree now; --worktree adds a throwaway worktree holding round n-1 and prints its removal command',
			"recap - the <details> part of a pull request from the hand-over's records only; writes nothing",
			"report - reads files only (no git, no process, nothing written): the lot's stations, tokens, money, time, suites per station by time, heavy steps, folders and review rounds from its events.jsonl, transitions, ledger and cards.log; a number nobody reported is unknown, never 0, and a step family whose runs may be unrecorded reads unknown with the reason; --feature lists every lot of that feature in every store (simulated ones counted apart, listed by --simulated; a lot whose folder is gone is read from its cards.log line); next: the lot's own next command",
			"export - copies a lot folder to <dir>/<full name>/ without asks/ (links kept as links, those pointing outside it named), adding the lot's cards.log lines and registry entry; refused for a <dir> inside a git work tree and for an existing <dir>/<full name>; every copied file compared by size and sha256 (events.jsonl as a prefix) before the rename, one more copy on a difference; the source is never written",
			"close - for a committed or abandoned hand-over of the registry (by name or index): its final record first, the card line in the repository's cards.log (a catch-up one when none exists, for every hand-over of the worktree, read back), then a removing line, then its worktree moved to .worktrees/_trash/ and removed in the background by git worktree remove without --force (git refuses one written into since the check: it stays in .worktrees/_trash/), its node_modules parked in .worktrees/_pool-<repository>-<n>, its caches to their own _trash/ entries, then a removed line (trashed or kept); kept first when an open lot names it (reason lot <name> <state>; a lot whose hand-over was committed outside its folder reads committed once its branch is past the lot's base commit and on the base branch, and every outcome of its worktree carries the line lot <name> committed: hand-over committed in <folder>, branch on <target>, landed in --json; once closed, every reader reads that lot committed, files only; a lot with a live run or a transition later than that hand-over reads from its own records), then with why when it is the main checkout, on another branch than the hand-over's, locked, another hand-over of the same worktree is neither committed nor abandoned, a link from outside it points into it, dirty, its HEAD reflog reaches commits that neither the hand-over's branch, the base branch nor a remote-tracking ref holds, it holds ignored files its removal would delete that nothing else holds (rebuilt folders, dialecte.rebuiltIgnored folders, the .dialecte/lot link, an empty or archived .dialecte/lot.json and copies byte-equal to the main checkout's go), a process or a mutation run works there, lot close itself runs from inside it, or the processes are not known, or the final record cannot be kept or the lot's commit is not known; the branch never touched; a hand-over already closed answers already closed, exit 0, nothing moved; exit 1 when one is kept, 2 for a name or index the registry does not hold",
		],
		exitCodes: [
			'1  station: the event could not be written',
			'2  station: usage; refused (a field, the lot state, open starts, --event with other fields, over 4,096 bytes); --run naming no start',
			'1  report: --feature names no lot',
			'2  report: usage; unknown or ambiguous id',
			'1  export: the check failed twice, nothing left',
			'2  export: usage; refused',
			'3  wait, result: input-required',
			'4  wait: an agent failed or hit a limit, run again',
			'5  wait --timeout, result: still working',
			'6  status, wait, result: the lot is damaged: a person must look',
		],
		example:
			'dialecte lot finding ../handover --round 1 --severity nit --at src/a.ts:3 "a finding"',
	},
	inbox: {
		family: 'Grow',
		summary:
			'What waits on someone across every lot store: questions for a person, questions for a caller, ready hand-overs, failed lots',
		usage: ['dialecte inbox [--repository <name>] [--simulated] [--json]'],
		notes: [
			'reads every store of the store list and the store of the current folder, files only: one line per waiting lot (one per open question), grouped person, caller, ready, failed and by index, each with its exact next command; then working <n> · simulated <m>; a lot whose records do not read is a damaged line',
			'--repository - the lots of the repository folder of that name only (the basename, exactly), the counts too',
			'--simulated - the simulated lots that wait are listed in their groups (they are only counted without it)',
			'--json - { waiting: the status of each waiting lot, working, simulated, damaged }',
		],
		exitCodes: ['1  nothing waits and nothing is damaged'],
		example: 'dialecte inbox --repository scl',
	},
	plan: {
		family: 'Plan',
		summary:
			"What can start now in a plan's lot block, whether the block is valid, a person's mark",
		usage: [
			'dialecte plan next <plan.md> [--json] [--all]',
			'dialecte plan check <plan.md> [--json]',
			'dialecte plan mark <plan.md> <id> done --by <who> [--reason <text>]',
		],
		notes: [
			"the block - one fenced ```json dialecte-lots block in the plan, or the file <plan without .md>.lots.json beside it (both or neither: refused); each entry's id, kind (lot, fix, spec, person), dependsOn, scope per repository, heavy steps, brief and match (branch, handover, feature); unknown keys refused, every fault at once",
			'next - proposes only, starts and writes nothing: the state of each entry read from the stores, the hand-over registries and the worktrees of its repositories (files only, no git process except one probe per lot whose hand-over was committed outside its folder: once its branch is past the base commit of the lot and on the base branch it reads committed; once lot close closed that hand-over every reader reads it committed, files only; a live run or a transition later than that hand-over reads from its own records), the open lots, the lots that can start in critical-path order (merge:, after, unverified, stacks, next command), the held ones with each scope pair met, the landed lots (lot <name> committed: hand-over committed in <folder>, branch on <target>; until lot close closes that hand-over), person entries without a mark, the spec work, what each entry waits for, the parked ones, the live heavy steps with the load against twice the cores and the available memory against 2 GB (advice only); --all lists the done entries; --json { plan, repositories, counts, entries, proposals, held, landed, specWork, heavy, unknown }',
			'check - the block parses and every repository is a git main checkout (two names for one common folder refused); one line when valid; --json { plan, valid, faults }',
			"mark - a person entry only: appends { plan, id, state: done, by, reason, at } to <state>/dialecte/plans/<sha256 of the plan's real path, 16 hex>.jsonl, once (again: already); per machine",
		],
		exitCodes: [
			'1  next: no lot or fix can start now (spec work may still be listed)',
			'2  usage; no block or an invalid one (every fault listed); a repository that is not a git checkout; mark: not a person entry, an unknown id',
		],
		example: 'dialecte plan next 33-LOT-ENGINE.md',
	},
	gate: {
		family: 'Check',
		summary: "The package's Definition of Done with the real counts",
		usage: [
			'dialecte gate [--fast | --full] [--base <ref>] [--no-reuse] [--declare <path>]... [--json]',
			'dialecte gate --hook [--no-reuse]',
			'dialecte gate --release [--base <ref>] [--no-reuse] [--json]',
		],
		notes: [
			'steps from package.json "dialecte": { "gate", "generatedDocs" } or the defaults; --full then runs npm run type-narrowing when the package has that script and no step runs it (a skip line when it lacks it); refuses while a hand-over script holds the repository',
			"--fast - the default; starts with the worktree's hygiene (nothing staged, no stash on its branch, new files declared)",
			'a failing vitest test step is rerun once, serially, on its failing files: passing there it is flagged flaky in parallel',
			'a green record of the same tree, install and steps answers the steps after a fresh tdd step; --no-reuse runs them',
			'--full and --release hold the machine awake while they run (macOS: caffeinate -i -w <pid>; DIALECTE_KEEP_AWAKE=0 turns it off); a run that spanned a sleep keeps sleptMs on its record and the card says it',
			'--hook - in a commit hook, the test steps of --full, unless a green --full record of the committed tree, install and steps answers them (or a green --release whose list covers full)',
			'--release - alone: "dialecte.gate.release" (default: the --full steps), every scoped step against the empty tree (--base feeds only the tdd step); records dialecte-gate-release.json; its green record answers a hook, a rehearsal, contrib and the card when the list covers full (same name, run, counts and changedOnly for every full step)',
			'scoped steps ("scoped": true) get DIALECTE_GATE_BASE, _TREE, _CHANGED (the changed paths byte for byte, NUL-separated, relative to the repository top as git diff --name-only names them; a declared failing path is relative to the package root) and _SELECTION, where they write { schema: 1, base, tree, changed, selected: [{ id, reasons }], skipped: [{ id, reason }] } (both lists required, reasons non-empty); the base is --base <ref>, else the merge-base with the base branch (the first found: "dialecte.baseBranch", origin/HEAD, main, master; each local, else on origin), else the empty tree; select from the working files; without the gate (no DIALECTE_GATE_SELECTION): select everything',
			'a step whose run is npm run <script> the package lacks is not wired: a default step fails a --full or --release run (a --fast one says it and goes on), a declared step fails in every mode; then no step runs, the others read not run: a step of the list is not wired; "dialecte": { "gate": { "skip": { "<default step>": "<reason>" } } } (dialecte.gate.skip) opts a default step out, a warning with its reason',
			'a scoped step: an empty selection exits 0 without starting vitest (nothing selected since <base> (<n> paths changed)); a non-empty one on a counts: "tests" step that runs no test fails; a failed scoped step counting tests is rerun once serially on a test failure (a failed test, a FAIL line, vitest\'s error markers), whatever runs it: the failing files (after -- through npm run), then --no-file-parallelism, and it must select the same ids (one vitest invocation, or --passWithNoTests on each); the selection may declare "failing": [paths relative to the package] the record keeps with the ones the output names; "heavy": true marks a heavy suite, outside the command hash',
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
			'a contributor: no consumer name nor forbidden word (git config dialecte.forbiddenWords and $XDG_CONFIG_HOME/dialecte/forbidden-words, else ~/.config/dialecte/forbidden-words; whole words, any case); no list: one line, and the check is not run',
			'without files: the changed list a scoped gate step hands (DIALECTE_GATE_CHANGED), else the files changed against HEAD and the new ones; a file it cannot read or parse is an error',
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
			'a step whose run is npm run <script> the package lacks is not wired: it fails, default or declared; then no row runs, the others read not run: a step of the list is not wired; "dialecte": { "contrib": { "skip": { "<default step>": "<reason>" } } } (dialecte.contrib.skip) opts a default step out, a warning with its reason',
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
			'dialecte handover write <lots.json> [--release] [--target <branch>] [--out <id|folder>] [--rehash] [--json]',
			'dialecte handover show [<name|folder>] [--json]',
			'dialecte handover review <name|index|folder> [--json] [--print]',
			'dialecte handover run [<name|folder>] [--rehearse [--keep] [--full]] [--resume-merge]',
			'dialecte handover abandon [<name|folder>]',
			'dialecte handover list [--root <dir>] [--json]',
			'dialecte handover --legend',
		],
		notes: [
			'write - the hand-over folder (lots.json, snapshot, one-line commit.sh) and its card, registered in <git common dir>/dialecte-handover/<name>.json under the real path of the folder; handover <lots.json> is the same; --out <id> writes into the lot folder, refused (exit 2, nothing written) for a simulated, canceled or failed lot, an open question, a lots file of another worktree or branch; any folder whose hand-over is committed is refused',
			'write --target <branch> - the branch the lots land on, recorded as target in lots.json (default: the base branch resolved at write time); a branch with neither a local nor an origin ref is refused (exit 2, nothing written)',
			'show - the card again, recomputed, nothing written; without an argument the newest of the branch; BLOCKED with a ! line when the target branch moved past the hand-over (merge it first); BLOCKED with a ✗ processes line naming the processes left running in the worktree (no terminal, not under an editor, not named in git config dialecte.personProcesses)',
			"review - opens the hand-over's worktree in a new editor window, started detached (a hand-over holding a merge lot first writes review/lot.diff, the lot's change against head, and opens it too); the editor: git config dialecte.editor in the worktree (its words, no flag added), else the first known editor found on PATH, else code; never $EDITOR; --print prints the command line and starts nothing, --json answers { editor, command, opened }; refused (exit 2) for an unknown hand-over, a worktree that is gone, an editor not found",
			'run - what commit.sh runs: each guard with its time, each lot announced, the hook live, the card; without a folder the one registered hand-over still to run; --rehearse commits in a scratch clone; refuses a canceled lot (exit 2); holds the machine awake while it runs, and a run that spanned a sleep says so on the DONE card',
			'abandon - marks a hand-over that will not run (abandoned.json) and releases its lock; refuses a lot folder (exit 2): rewrite it with write --rehash --out <full name>, end the lot with lot stop',
			'list - every hand-over folder: repository, worktree, branch, lots, age, state',
			'--legend - every term of the card, what it means, whether to look',
		],
		exitCodes: [
			'2  run: the target branch moved past the hand-over (merge it first) or has no ref, a process left running in the worktree or a process list not known, a gate config the cli cannot run, a canceled lot; nothing committed',
			'2  write: a --target branch with neither a local nor an origin ref, no base branch found without --target, an --out the lot folder refuses; nothing written',
		],
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
			'prune - merged worktrees and branches, committed hand-overs, rehearsal clones: the commands with their cd; a worktree an open lot names (working, input-required, ready, failed) is kept first, reason lot <name> <state>; --yes runs them after a confirmation on a terminal; the pool (.worktrees/_pool-<repository>-<n>) and the trash (.worktrees/_trash/) are counted, never touched',
		],
		exitCodes: [
			'0  add: the worktree exists, whatever the links and the lockfile say',
			'1  add: a new branch without --from, and the base branch refused (a dialecte.baseBranch set to a branch that exists nowhere, local or on origin, or no base branch found); no worktree made',
		],
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
	// the renamed commands: one key per command of the renamed forms, derived from that table
	...renamedEntriesOf(),
}
