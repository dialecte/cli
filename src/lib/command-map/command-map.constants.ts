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
	'Env: COVERAGE_CHILD_CAP=N (cap child edges).',
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
			'dialecte standard eval <gold.jsonl> [--standard <id>] [--package <name>] [--angles] [--packs [--effort low|medium|high]] [--reports <asks folder>] [--json]',
		],
		notes: [
			'the vocabulary - the tags, attributes and enumeration values of the installed dialectes (--package <name>: that one only); index, find and eval print it first',
			'index - builds (or reuses) the index of each standard folder, prints its quality per file',
			'find - the ranked slices of whole lines that hold the terms, then the clauses they refer to [linked]; --about <Tag> adds a tag of the installed dialectes',
			'show - the normalised text of a range of original lines; a file id is <standard id>/<file name without .md>',
			'eval - recall at 5 and 10 of find over a local gold file of { question, about?, expected: [{ file, quote }] } lines; the expected quotes are alternatives; --angles runs each question through the ask ladder (no fact read or written, no ask kept) and scores its merged slices; each gold line may also hold kind (fact | polarity | exception | not-in-text), answer and status',
			'eval --packs - the recall at 5 and 10 of the slices the round-1 readers are given (the ask ladder, no fact read or written, no ask kept, nothing written): reader A in its order, and the A and B slices together (A1, B1, A2, B2, a slice met twice kept once); --effort low|medium|high sets the readers (default medium)',
			'eval --reports - the agreed-wrong rate of recorded asks: the asks of an asks folder whose question equals a gold question are judged by their last answered round (a not-in-text item the readers did not agree not-in-text, an item with an answer they agreed not-in-text, a gold answer starting yes or no and the other verdict, a value its gold answer does not hold: wrong; no rule decides the rest: unjudged); rate = wrong over agreed and wrong, null (printed -) when nothing is judged; runs outside a package, writes nothing',
			'eval --json - schema 1; packs: { readerA: { recallAt5, recallAt10 }, union: { ... } } only with --packs, reports: { agreed, wrong, unjudged, rate } only with --reports',
			'the standard is never copied into a repository: its index is in $XDG_CACHE_HOME/dialecte (else ~/.cache/dialecte)',
			"the card's standard line - a lot's standard.json in state outside (its asks answered outside the documents) warns, and fails at effort high unless the record's confirmed flag is true (a person confirmed every outside answer; lot standard ... outside writes it false): the flag decides, never the note text",
		],
		exitCodes: [
			'1  index: no indexable file · find: nothing matched · show: only blank or dropped lines · eval: no item with an expected quote · a file changed during the build',
			'2  usage · no standard configured · a root or cache inside a git work tree · colliding ids · an unknown standard, file, --package or --about tag · eval: a gold line that is not an item (kind not one of the four), --effort not low, medium or high or without --packs, --packs outside a package with a dialecte installed, a --reports folder that does not exist',
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
	ask: {
		family: 'Discover',
		summary:
			'Answer a question about a dialecte: a fact recorded before, the definition, the catalogues and api indexes, else the slices of the standard for readers',
		usage: [
			'dialecte ask "<question>" [--about [<Parent>/]<Tag>[@<attr>] | --code <code> | --method <path>] [--kind <kind>] [--decision] [--package <name>] [--effort low|medium|high] [--lot <id|folder>] [--limit <n>] [--no-facts] [--no-standard] [--person-only] [--json]',
			'dialecte ask pack <ask-id> [--out <dir>] [--outside] [--web] [--lot <id|folder>] [--json]',
			'dialecte ask verdict <ask-id> [<report.json>...] [--missing <letter>]... [--adjudicator] [--lot <id|folder>] [--json]',
			'dialecte ask answer <ask-id> "<answer>" --by <who> [--verdict yes|no|depends|value] [--cite <file id>:<from>-<to> --quote "<quote>"] [--lot <id|folder>] [--json]',
		],
		notes: [
			'the ladder - rung 0 a fact of the same question (reused at its effort or above), rung 1 the definition (a structural question: children, parents, required, values, default, fixed, type, variants, documentation), rung 2 the catalogues (a code) and the api indexes (a method), rung 3 the slices of the standard found from the angles of the question',
			'--about [<Parent>/]<Tag>[@<attr>], --code, --method name the subject; --kind forces the kind; --decision skips rung 1 (a choice the definition does not make)',
			'--decision reads the definition as the boundary of what is valid (boundary: <answer> (definition), never the answer): a stored schema fact is a candidate only; a standard or person fact answers inside it; one naming what the XSD rejects is cut to the boundary (a list) or takes its answer, and a ! conflict: line flags it (standard-vs-xsd, exit 0): the XSD wins, fix it and ask again',
			'an answer from rung 1 or 2 is recorded as a fact in $XDG_DATA_HOME/dialecte/facts at the ask effort; --no-facts reads and records none',
			'an ask is a folder A-<n> holding ask.json (the --json object, schema: 1, with boundary and conflict): with --lot <id|folder> in <lot folder>/asks/ (a store lot by index, name or folder, or a hand-over folder outside every repository), inside a lot worktree in its lot, else in $XDG_STATE_HOME/dialecte/asks/',
			'the events (ask.parsed, ask.rung, ask.fact, ask.state, ask.pack, ask.answer) go to the lot events.jsonl, else $XDG_STATE_HOME/dialecte/asks/events.jsonl; they hold the question length and key hash, never its text; ask.state says conflict: true|false, never what conflicts; ask.pack the round, the readers and skipped; ask.answer rung 6, the reader miss and citeRefused, never the answer or a quote',
			'the documents - the DIALECTE_STANDARD folder whose id matches the dialecte standard name; without one the ask goes to outside readers (--no-standard is refused while documents are readable)',
			'--effort - a lot ask takes the lot effort; elsewhere --effort, else medium',
			'pack - the next round of readers of an ask (the ask folder keeps request.json beside ask.json: what the ask read): rounds/round-<r>/ gets reader-<A|B|C>.md and .json (the slices with their line numbers, the report schema, a nonce each) and pack.json; A reads by rank, B by angle family, C (high) as B without the top slice, each up to 1,500 non-noise lines; a later round gives no slice a reader of the same letter had; pack again on an open round prints the same briefs; --out copies them; --outside [--web] for an ask without documents',
			'verdict - checks the reports of the open round, one report file per reader the round gave (refused ones too; else exit 2, nothing recorded) (each cite inside a slice given to its reader, each quote in its lines, each nonce used once: rounds/round-<r>/used/<nonce>) and writes rounds/round-<r>/verdict.json; reports agree on the verdict, the value and a shared line or clause: low 2 readers 1 round, medium 2 readers 2 rounds, high 3 readers 3 rounds (a verified dissent is another round); nothing verified searches again while something is left, up to 5 rounds; an agreed answer is recorded as a fact (the union of the verified cites, the shortest answer; a --decision ask held inside the boundary); outside readers answer in one round, all agreeing, recorded unchecked by source (model, web) unless the definition says otherwise',
			'the adjudicator - at high, readers that never agree or a polarity conflict go to the adjudicator: ask pack writes rounds/round-<r>/adjudicator.md and .json (the reports with their checks, the union of their cited ranges, a nonce); its report goes through the same checks with ask verdict <id> <report.json> --adjudicator: verified, the fact (rung 5); else a person',
			'answer - the person answers an ask that is not answered, or confirms one the outside readers answered (a person fact superseding the outside one, unchecked while the ask read no documents; <ask>/confirm.json marks it confirmed; a second confirmation refused) (rung 6); --verdict yes|no|depends|value keeps that verdict on the person fact (value: the answer as the value), else it says person; a person fact by <who> (unchecked: true when the ask read no documents, or under --person-only), answer.json in the ask folder; --cite (with --quote) is checked as a reader cite and recorded as a reader miss (given or not to a reader, and the round), a refused cite named (citeRefused) while the answer is still recorded; an ask of a store lot that reaches the person raises one question on the lot (its text <ask-id>: <question>, at most 500 characters, the full text in its details), and lot answer on it records the same person fact; in a hand-over folder or outside a lot the ask answer command is printed',
			"the lot note - after ask, verdict and answer, a lot's standard.json is recomputed from every ask's latest state (consulted; outside when any ask past rung 2 went outside, every ask listed, with confirmed: true and ending (all confirmed) when a person answered or confirmed each outside ask, else (all unchecked)), under <lot folder>/standard.json.lock; a lot whose asks all stopped at rungs 0-2 records nothing; a verdict run holds rounds/round-<r>/verdict.claim while it runs, a second run on that round is refused; ask verdict and ask answer hold <ask>/ask.claim, so one of them records the ask's fact, the other is refused (in progress); a retry after a crash closes the ask on the fact already recorded",
		],
		exitCodes: [
			'1  no rung answers and a person answers next (--person-only) · pack: nothing new to give (the round skipped, the adjudicator or the person next) · verdict: the person next (no agreement, nothing found, the adjudicator refused)',
			'2  usage · an unknown --about tag or attribute (the closest named) · several dialectes without --package · two standard folders of one key · --no-standard with documents · --effort other than the lot effort · a --lot folder inside a repository · pack: an unknown or answered ask, no request.json, a file changed since the ask, --outside on a documents ask or the reverse · verdict: an answered ask, no round open, a closed round, every report of another ask or round or unreadable, --adjudicator on an ask not waiting for it, a round another verdict run holds (nothing recorded) · answer: an unknown or answered ask, no --by, --cite without --quote (nothing recorded)',
			'3  readers answer next: dialecte ask pack <id> (the slices of the documents, or --outside without them) · verdict: another round, or the adjudicator (dialecte ask pack <id> writes its brief)',
		],
		example: 'dialecte ask "children of Bay"',
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
			'dialecte lot start <brief.json> [--effort low|medium|high] [--overlap-ok] [--by <who> --reason <text>] [--dry-run] [--simulate <scenario>] [--json]',
			'dialecte lot start <brief.json> --on <lot> [the options above]',
			'dialecte lot start <brief.json> --keep <why> [the options above]',
			'dialecte lot status <id> [--json]',
			'dialecte lot forecast [<id>] [--json] [--against <lot>]',
			'dialecte lot risk <id|folder> [--json]',
			'dialecte lot risk <id|folder> --effort low|medium|high [--class high|medium|light] --by <who> [--reason <text>]',
			'dialecte lot wait <id> [--timeout <seconds>] [--json]',
			'dialecte lot answer <id> <question> "<answer>" [--by <who>] [--json]',
			'dialecte lot result <id> [--json]',
			'dialecte lot stop <id> --reason <text> [--by <who>] [--json]',
			'dialecte lot scope <id> [--drop <path>]... [--add <path>]... [--overlap-ok] --by <who> --reason <text>',
			'dialecte lot keep <id> --by <who> --reason <why> [--json]',
			'dialecte lot unkeep <id> --by <who> --reason <why> [--json]',
			'dialecte lot station <id> start <station> [--step <n>] [--round <n>] [--attempt <n>] [--agent <name>] [--executor host|command] [--vendor <name>] [--model <name>] [--tier <name>] [--effort <word>] [--session <id>] [--skill <name|path>]... [--skill-asked <name|path>]... [--event <id>] [--json]',
			'dialecte lot station <id> end <station> [--run <run>] [--step <n>] [--round <n>] [--attempt <n>] [--agent <name>] [--vendor <name>] [--model <name>] [--tier <name>] [--effort <word>] [--session <id>] [--skill <name|path>]... [--skill-asked <name|path>]... [--event <id>] [--tokens-in <n>] [--tokens-out <n>] [--tokens-cache-read <n>] [--tokens-cache-write <n>] [--tokens-total <n>] [--money <amount> <currency>] [--duration <seconds>] [--exit <n>] [--verdict <word>] [--suite <name>=<runs>]... [--json]',
			'dialecte lot station <id> --from <file.json> [--json]',
			'dialecte lot exempt <reason>',
			'dialecte lot accept <case> <reason> | lot accept --remove <case>',
			'dialecte lot revised <case|file|glob> <reason> | lot revised --remove <case|file|glob>',
			'dialecte lot gone <file|glob> <reason> | lot gone --remove <file|glob>',
			'dialecte lot moved <case> <case> <reason> | lot moved <file> <file|glob> <reason> | lot moved --remove <from> <to>',
			'dialecte lot mutation <off|changed|audit|gate>',
			'dialecte lot finding <id|folder> --round <n> --severity <blocking|should-fix|nit> --at <file:line> <finding>',
			'dialecte lot decide <id|folder> <finding> <open | fix-to-verify | fixed <round> [note] | accepted <reason> | logged <where>>',
			'dialecte lot snapshot <id|folder> --round <n> [--beyond-cap --by <who> --reason <text>]',
			'dialecte lot choice <id|folder> --by <who> <decision>',
			'dialecte lot standard <id|folder> consulted <note> | not-consulted <reason> | outside <note>',
			'dialecte lot delta <id|folder> --round <n> [--worktree] [--json]',
			'dialecte lot recap <id|folder>',
			'dialecte lot verify <id|folder> --by <who> --note <text>',
			'dialecte lot report <id> [--json]',
			'dialecte lot report --feature <name> [--simulated] [--json]',
			'dialecte lot report --kept [--json]',
			'dialecte lot export <id> <dir> [--json]',
			'dialecte lot brief <id> --from <brief.json> --by <who> --reason <text>',
			'dialecte lot pr <id> [--print] [--json]',
			'dialecte lot review <id> [--no-open] | lot review <id> --pull --round <n>',
			'dialecte lot approve <id> --by <who> [--reason <text>]',
			'dialecte lot design <id> [--from <file> | --from-plan | --approve --by <who> [--reason <text>] | --waive --by <who> --reason <text>] [--json]',
			'dialecte lot land <id>',
			'dialecte lot close <hand-over name|lot id|index>... [--json]',
			'dialecte lot close --feature <name> [--json]',
			'dialecte lot prune [<id>...] [--feature <name>] [--all] [--yes] [--json]',
		],
		notes: [
			'start - checks the brief (every refusal at once, exit 2), claims the next index, publishes the lot folder in <git common folder>/dialecte-lots/, makes the numbered worktree at the base commit with its .dialecte/lot link; --dry-run checks (the store list included), names the lot and the start to run next, writing nothing; exit 1 when the worktree cannot be made (the lot failed, nothing removed, next: lot stop); a link that cannot be made leaves the lot working with a note; every --json exit is JSON, a usage error { error, usage, next: null } included',
			"start - --keep <why> or the brief's keep (one line of at most 200 characters) keeps the lot on purpose from its start: its first keep.jsonl line, signed by --by (orchestrator in any casing recorded orchestrator) or caller, is written with its records before the lot is published (a simulated lot's too; --dry-run names it, keep: <why>, writing nothing), the start line and --json name it (kept: <why>); --keep and a brief keep together, or a keep or its signer holding a forbidden word, a path, a link, a reference or a plan entry id, refuse (exit 2, nothing published); after the start a keep changes through lot keep and lot unkeep only (lot brief refuses a changed keep)",
			"start - --on <lot> starts the lot on another open lot of the same repository (a stack): its branch is cut at that lot's branch tip, its stack.json records the parent only (where it forks is read from git when it lands), and the parent's scope is its base, never an overlap, at the start and at lot scope --add (every other open lot's still is); a parent that is unknown, damaged, not working or ready, of another repository or without its branch is refused before anything is written, before any other fault of the brief; lot status shows a stack line, on <parent> (#<pull request>, <state>), the parent read through the one lot reader: merged once its landing is proven (its landed fact, git or the host), else its pull request as the host holds it (open, draft, queued, closed, or the host cannot say: <why>), the hand-over card on <parent> (#<pull request>) from files only; on <parent> (no pull request yet) without one",
			"start - a scope meeting another open lot goes ahead when that lot's work reads (its forecast against main, run and never written: a new lot has no work, so no conflict can exist), printed shares <met> with <lot> (forecast clean); still refused: a damaged lot or one whose scope cannot be read, a met lock file (exclusive: a lock file is never shared), a forecast that cannot run (forecast unknown: <reason>); after the start the new lot's own forecast is recorded (trigger start); the re-check after the start refuses only what still refuses (a lot that published meanwhile but has no worktree on disk yet has no work: the start goes on)",
			"start - --overlap-ok accepts an overlap the start refuses, for an overlap that names its paths (a lot whose scope cannot be read stays refused; a damaged other lot whose scope reads is accepted, its damage recorded beside the go-ahead); it takes --by <who> --reason <text>, the same go-ahead as an effort below the class; each accepted overlap is a line of the lot folder's overlaps.jsonl (the other lot, the met pairs, who and why), printed by the start and its dry run (! overlaps <lot>: ...) and shown on the card's scope line as a warning; on an overlap the forecast cleared it is recorded all the same, printed --overlap-ok not needed: the forecast cleared <lot>; the re-check after the start refuses a held lot the go-ahead did not name",
			"start - the effort: the risk class of the brief's scope (high when an entry reaches the package's dialecte.risk.high list) sets the default (high, medium or low); on a terminal, without --json or --dry-run, the effort is asked with that default; an effort below the class (from --effort, the brief or the answer) is refused (exit 2, nothing written) without --by <who> --reason <text>, which are recorded on an effort line in risk.jsonl with the class's derived line, the start printing ! effort <e> below risk class <c> (by <who>: <reason>)",
			'--simulate - start a simulated lot that plays one of the scenarios (ready, question, person, two-questions, limit, failure, slow) under wait: no worktree, no branch, no registry entry; it never blocks a real lot',
			"brief - a working or ready real lot takes a new brief whose only changes are its public text (the summary, the issue, step titles and behaviours); any other change is refused naming the field, nothing written; the new brief passes the start's field and public-text checks; it replaces the stored brief and a brief transition records the sha256 of the old and new brief, --by and --reason, the state and position kept; the same brief again answers already, nothing written; a simulated lot is refused; brief.json edited any other way reads as damage",
			"pr - renders the lot's pull request from its records through the repository's .github/pull_request_template.md: the title is the brief's first commit message, the body its summary and other commit messages, step titles and behaviours, the changelog fragments the lot adds, tests.json (a part of another tree reads stale), review.jsonl (findings and how each closed, the verdicts by reviewer kind, never a name; a row value its writer never writes refused), the risk class and effort, the overlaps it accepted (the other lot by its index, and why), the issue it closes, and the author's checklist ticked from the records; a missing record reads not recorded; the record text is checked first (a reference, a forbidden word, a plan entry id, a link or a path outside the tree refused, naming the word and the record); the open pull request (landing.json's, else the branch's newest) is edited only when its title or body reads otherwise, a person's part after the kept marker kept (a body without that heading holding a person's text refused, never dropped); a damaged lot refused; --print prints and sends nothing; no pull request yet prints the text and names lot land; --json { title, body, changeRequest, head, sent }",
			"review - the private half of the lot's review, read-only (nothing written): the lot's state and branch, its pull request (landing.json's) with the head it is at, the head the lot landed and the worktree's HEAD, its checks, the brief's goal and steps (title, spec, behaviours), tests.json's tdd counts and gate run, decisions.md, every finding of the ledger with its text and state, the standard line, and what lot approve would refuse (or the approve command when it would approve); then opens the pull request's changed files in the browser (--no-open names the page only; an opener that fails is named, never an exit); a lot without a landing prints its private half and names lot land <id>, the host never asked",
			"review --pull - the pull request's line comments come back as findings of round <n> in the lot's findings ledger: a thread's first comment only (replies discuss it), each once (pulled-comments.jsonl records the comment and its finding; a second pull answers already), its severity from a leading blocking:, should-fix: or nit: (dropped from the text, kept when it is all the comment says), else should-fix, at its path:line (the path alone for a comment on the file), its lines joined into one; review.jsonl written again; private points stay off the pull request: lot finding records them",
			"approve - a person's approval of the lot's pull request: refused (exit 1, nothing recorded, nothing queued) unless the lot is at work, the pull request landing.json names is open at the head the lot landed and the worktree is at that head too (an unpushed commit refuses), its checks ran on that head and are green (a check run again counts by its newest run; a failing or pending check, or none yet, refuses) and no finding but a nit is open (open, or a fix still to verify), and its text renders over the live body; then appends { schema, at, by, reason?, number, head } to the lot folder's approvals.jsonl, which review.jsonl shows as a person's approve verdict with that head (a pull request text rendered on another head, after a later commit or a rebase, leaves it out; the body names it by kind only, never the name; the orchestrator in any casing is recorded as orchestrator), renders the pull request's text again from the records, makes a draft ready and queues it (gh pr merge --auto; a lot started with --on whose pull request still merges into its parent's branch queues as a stack up to it, gh stack merge, and only on a host with stacks once the parent's pull request, read by the parent's branch, is queued (auto-merge on or in the merge queue), refused otherwise before anything is recorded: approve the parent first, or land it again once the parent merged); the only verb that queues, lot land never does; a queue the host refuses keeps the approval (exit 1) and the same approval run again answers already approved, writing nothing, and queues; --by orchestrator (in any case) approves the cli's own lots only (the package named @dialecte/cli), every other package waits for a person (exit 2); a forbidden word in --by or --reason, or a --by holding what a public record never holds, refused (exit 2) before the host is asked; a lot without a landing names lot land <id>",
			"design - a lot's design (design before code): --from <file> records it by the sha256 of its bytes, appending { schema, at, kind: recorded, file, hash, from } to the lot folder's design.jsonl and keeping its copy as design/<hash>.md (the copy rules once the source is gone); a file missing, empty, not UTF-8 or under a scratch root, the system's temporary folder, /tmp or /private/tmp (wiped there) is refused (exit 2), nothing written, and a file outside every git work tree is recorded (plans live there); without a worktree the lot is read at the base recorded at its start, a ! line saying so; --from-plan records the spec of the plan entry the lot carries out, refused when another lot or fix entry of its block names the same spec (write this lot's own design) or the lot carries out no entry with a spec; --approve --by <who> [--reason <text>] appends an approval of the last recorded hash with the need it was given against, refused when nothing is recorded or the source exists with other bytes (record it again); --waive --by <who> --reason <text> appends a waiver with the current need, refused on a lot that needs no design; both refused from the lot's own worktree or its review throwaway (approve from the main checkout), and on a --by or --reason holding a forbidden word or a --by holding what a public record never holds (exit 2); the orchestrator in any casing is recorded as orchestrator; a lot no longer at work is refused (exit 1); without an option it prints design <state>[ by <kind>][ · <reasons>] and the next command, --json { required, reasons, state, by, uncovered } (by the kind, never a name)",
			'design - the need, computed by every reader and never stored: required when a scope entry (or a path) lies in a dialecte.risk.high area or is broader than one, or the lot carries out a plan entry of kind lot; an approval or a waiver holds only for the need it was given against (a reason of a new kind or glob reads unapproved or missing again); a recorded design gates the lot whatever its need; states approved, waived, unapproved (shown not approved), stale (shown stale since its approval: the source edited after its approval), missing, not-required (shown not required); lot start and its dry run print design required (<reasons>) or design not required, lot forecast and lot status the state line, the hand-over card a design line (passed or a warning, never failed), review.jsonl a design row and the pull request body Design: <state> by <kind>',
			"design - the gate: while a lot's required design is missing, unapproved or stale, tdd red in its own worktree refuses (exit 2, nothing run), gate --hook's design step fails a commit of the lot's branch, from any worktree, holding a production path (first, whatever dialecte.gate.hook declares; a refused design recorded in the lot's events; a commit of tests or docs only passes; a first or merge commit and a review throwaway on <lot branch>-round-<n> skip it; a branch no lot names gives no line), lot land refuses after its rebase (nothing pushed), handover write refuses a store lot (nothing written), lot approve names design <state> among its reasons and the card's design line, read at the card's worktree, fails (handover run refuses); each reads the shared areas of the lot base its run resolved, through git, over the scope, the change's paths since that base and the staged or landed ones; a refusing path without the lot's worktree refuses; lot land records the base's shared areas again after its rebase",
			"land - a lot started with --on lands as a stack: its pull request is based on the parent's branch, its body's depends-on part names the parent's pull request (a parent without one is refused: land it first); the host's stacks are probed once (gh stack): with them, the pull request is linked on the parent's (gh stack link); without, a note says why; it is never queued (lot approve queues it); before each landing it is rebased onto the parent branch's newest tip (the local branch or origin's) when it does not hold it, from its fork point (git merge-base --fork-point: only its own commits move, whatever the parent's amend or rebase); once the parent merged (its landing state: a merge, a squash read offline, or its pull request merged; never the registry's committed alone, which a hand-over run writes before anything reaches the base), the parent's landed fact is recorded and the child is rebased with git rebase --onto origin/<base> <fork point>, only its own commits moved, and its pull request retargeted to the base when the host did not; when the host already rewrote its branch on origin (a native stack), it follows that rewrite (local commits beyond its last push rebased onto it, that head the lease); a conflict names its files, the rebase undone, nothing pushed, exit 2",
			"land - the lot lands through its pull request: its committed HEAD (uncommitted files stay in the worktree, named), rebased onto origin/<base> when behind (a conflict undone and named, nothing pushed; with uncommitted tracked changes it is pushed as committed, the rebase left for a clean worktree), pushed with a lease, its title and body rendered from the lot's records through the repository's .github/pull_request_template.md on the rebased head before the push (as lot pr renders them; records that do not render, or a base branch origin does not hold, push nothing), its pull request opened with them as a draft or reused (edited when its title or body reads otherwise, a person's part after the kept marker kept), never queued: CI runs on every push and lot approve, a person's step, queues it; a reused pull request queued or ready whose head to push no person approved (approvals.jsonl) is taken back out of the queue before the push (auto-merge off, gh pr merge --disable-auto; a draft again, gh pr ready --undo), since an approval is for one head: a rebase that only moves the sha takes it out too, and every landing checks, so one stopped after its push heals on the next (a refusal there pushes nothing); --draft, from when lot land queued, is refused (exit 2) naming the change; the landing (number, url, branch, pushed tip) recorded in <lot folder>/landing.json; a lot already merged (its pull request merged, or its tip or its work in origin/<base>: a squash read offline) is committed: its landed fact written in <lot folder>/landed.json, its hand-over entry committed, the commits made since named (they land in a new lot), the close line printed (for a lot kept on purpose, its keep and its lot unkeep instead: no line names lot close, and the line after an opened pull request asks to land it again once merged), nothing pushed; a branch with no commit beyond origin's base is refused before any push; the committed HEAD is forecast against origin/<base> just fetched (git merge-tree, before any entry, rebase or push): a conflict refuses naming its files and ranges, a forecast that cannot run refuses (fails closed), a lot on an open parent is not compared; the lot's forecast against every other open lot is recorded (trigger land) and each pair it does not clear printed (! <lot>: <why>), for information only; the pushed head is kept in landing.json at once, so a pull request the host refused to open does not make the next push one outside lot land; the host is GitHub through gh, which never prompts",
			"status - the state derived from the lot records (working, input-required, ready, committed, canceled, failed), the worktree and link checks, and the exact next command (and an also: line); a working real lot adds a station line (station <what> · round <r>/<cap> · effort <level>), the next station walked from its station events and checks (step events, else the worktree's tdd ledger and gate records), its next is that station's command and also keeps the manual line, which lot start prints as its next too; the manual line depends on the repository's landing flow: lot land <name> in a CI-first repository, handover write in any other; --json adds station and rounds (review, cap, beyondCap, independent) and effort { level, source, riskClass, below } (source risk-line for an effort recorded by lot risk; an effort below its risk class adds a ! effort <e> below risk class <c> line, ending (by <who>: <reason>) or (no go-ahead recorded)); --json adds forecast { main, pairs }: the newest main line of forecast.jsonl and, per other open lot, the newer of its own line against that lot and that lot's line against it (files only); a lot whose records do not hold reads damaged with its reason and next: lot stop (exit 6); a lot git reads merged (its tip or its work in origin/<base>, a squash included) shows committed, nothing written; --json adds kept: { reason, by, at } for a lot kept on purpose ({ unreadable: <n> } or { unreadableFile: <code> } for a keep.jsonl that cannot be trusted, read kept), else null, the text unchanged; a ready landing lot kept on purpose names no lot close in also; writes nothing; exit 2 for an unknown or ambiguous id",
			"forecast - the conflict forecast of a lot's work (its worktree's HEAD plus its uncommitted work, as one snapshot commit made on a copy of its index with a fixed identity and date; the worktree's index, refs and files never written, ignored files left out) against main (origin/<base> as last fetched, never fetched here) and against every other open lot of its store, each by git merge-tree --write-tree, without a checkout: clean, conflict (each path with its kind, content with the line ranges between the markers), exclusive (every conflicted path a lock file) or unknown with its reason (git older than 2.38, a damaged lot, worktree of <lot> missing, <ref> does not resolve, snapshot of <lot> failed, merge-tree failed, forecast of <lot> over 20 s: each git step is limited to 20 seconds); each line also lists the files both sides changed (shares); a path that conflicts against main for either lot is shown once, on the main line; the verdict is the worst line (unknown > conflict > exclusive > clean); default lot: the one whose worktree holds the current folder; --against <lot> compares with main and that lot only; appends the run to the lot folder's forecast.jsonl (one line per comparison, one write, each line at most 4,096 bytes: 10 shared paths, 10 conflict paths, 3 ranges per path, the rest counted in moreShared and more) and a forecast event (its trigger: start, scope, gate, forecast or land, the verbs that record a run); a pair whose lots both change a lock file reads exclusive even when it merges clean; a gate --fast or --full run in a lot's worktree forecasts the lot as its last step and prints forecast: <verdict> with one ! <against>: <why> line per comparison it does not clear (a warning only: the gate's verdict and exit never change); the card shows a conflicts line on a conflict or an unknown, a pair seen from either lot (the newer line wins), and its scope line names each open lot it shares entries with (forecast <verdict>, <age>); --json { lot, verdict, lines }; exit 0 clean, 1 a conflict or an exclusive path (or the run could not be written), 3 unknown, 2 usage, an unknown id, a damaged, closed or simulated lot, or --against the lot itself or a lot of another store; a clean forecast does not promise a semantic merge, three lots landing together, or work not written yet",
			"risk - reads the lot folder's (or hand-over folder's) risk.jsonl and the worktree's diff against the lot's base, writing nothing: the risk class derived now with its reasons (high: a changed file in the package's dialecte.risk.high list, the base's and the worktree's together, an added destructive call or git argument on a line that is not a comment alone, a runtime package (one with an exports map) whose API index changed or whose export source changed against the base without its index; light: docs, a version bump, or at most 40 changed lines in at most 3 files; medium otherwise; a declared reason reads <file>: declared [<glob>]), the effort recorded, the cap of review rounds, a ! line when the effort is below the class, ending (by <who>: <reason>) or (no go-ahead recorded); a derivation that cannot run (no commit to compare to) falls back to the last derived line, else class unknown, and ends with ! risk class not derived: <reason>, exit 0; --json the same as one object, under a versioned JSON schema (lot-risk.schema.json, version 1); exit 2 for usage, an unknown id or a damaged store lot (lot risk: <name> damaged: <reason>)",
			'risk --effort - appends one effort line { schema, kind: effort, at, effort, class?, by, reason? } to risk.jsonl (the last line wins); the same effort, class and reason as the last line answers already, nothing written; an effort below the class needs --reason; a derivation that cannot run compares against the last derived line, or nothing, and records; --by is required; --json is refused here; refused (exit 2, nothing written) for usage, below without --reason, a forbidden word, a damaged store lot, or a lot that is committed, canceled or failed; exit 1 when the line cannot be written',
			'wait - returns the status as soon as the lot needs someone (exit 0 ready or committed, 1 failed or canceled, 3 input-required, 4 a limit) or --timeout is reached (5); a damaged lot at once (6); a real lot is read every second and nothing written, a simulated lot is played to its next blocking point, and answered at once when nothing is left to play (5 while it works)',
			'answer - records the answer to an open question once (the same answer again: already); a person question needs --by <who>; a damaged lot takes none (exit 2); runs the onAnswered hooks; next: lot wait',
			'result - never blocks, writes nothing: a ready or committed lot gives its hand-over (card, show and run lines), worktree, branch and answered questions; failed or canceled the last reason (exit 1); input-required the open questions (3); working exit 5; damaged exit 6',
			'stop - ends the lot: refused once committed; a pending hand-over is abandoned first (refused while its run is in progress), then a canceled transition with the reason and --by (caller without it); already canceled exits 0 writing nothing; moves no worktree and deletes nothing; a damaged lot has its folder moved to <git common folder>/dialecte-lots-aside/ with a stopped.json (refused while a live run marker holds it), its index kept claimed; a damaged lot kept on purpose is refused, nothing moved, naming its lot unkeep first; a kept lot stopped stays kept (canceled and kept: its items stay)',
			"scope - changes a started lot's scope on the record, its brief left as published; --by and --reason are required on every call; --drop removes scope entries (an entry, or a folder and the entries inside it), --add widens the scope (a path inside a held entry is recorded as its own entry; only an equal entry answers already holds, nothing written, exit 0); --drop and --add may come in one call to narrow a folder to files: one append, the drop line first; a drop is refused for a path that is no entry or lies inside a wider one, a worktree that cannot be read, a drop leaving the lot no scope, or a file the lot's worktree changed inside a dropped entry that no entry left covers (an equal entry, a literal folder holding it, or a glob matching it; the call's adds count); an add is refused when a path is no valid scope entry, or when it meets another open lot's scope and that lot still holds it: the lot's work is forecast against it (trigger scope, recorded only once the add stands) and a clean pair adds with no overlap record; a forecast conflict (its files and ranges), a met lock file, a forecast that cannot run, or a damaged or unreadable lot refuse, unless --overlap-ok accepts an overlap that names its paths (a damaged lot whose scope reads too, its damage recorded) (recorded in overlaps.jsonl before the add with the other lot, the met pairs, --by and --reason, undone with a taken-back add; a lot whose scope cannot be read stays refused; --overlap-ok without --add is refused); a call whose lines would pass the line limit is refused; an add a lot started or widened meanwhile meets is taken back by an undo line, the entries a drop of the same call removed put back (exit 2), a take-back that would pass the line limit refusing the call first (exit 2), a take-back that cannot be written exiting 1 naming the paths and that lot; each change is one line of scope-changes.jsonl ({ schema, at, op, paths, by?, reason? }) and a scope.changed event; the effective scope (the brief's with the changes) is what the overlap guard, lot status and the card read; a damaged, simulated, committed, canceled or failed lot, a forbidden word and a change line that does not read are refused (exit 2), nothing written; a line that cannot be written exits 1",
			"keep - keeps a lot's items on purpose (its worktree, review throwaways and branches stay after it is committed or canceled): appends { schema, at, op: keep, by, reason } to the lot folder's keep.jsonl and a keep.changed event, in any state, damaged included; --by and --reason required, one line each, the reason at most 200 characters, orchestrator in any casing recorded orchestrator; a forbidden word, a path, a link, a reference or a plan entry id refused (exit 2, nothing written); the reason it is kept with already answers kept already, nothing written (another reason appends: the history stays); a keep.jsonl with a line that does not read, or that cannot be read, is refused naming it (repair it by hand); an event that cannot be written is one printed line, never an exit; prints <name> kept by decision: <why>; --json { lot, kept, written, next }; a keep never changes the lot's state, its scope's hold or any guard",
			"unkeep - releases a kept lot: appends { schema, at, op: unkeep, by, reason } and a keep.changed event, under the rules of keep; refused (exit 2, nothing written) from the lot's own worktree or one of its review throwaways (-round-<n>, -verify): a lot's own session cannot release what a person kept; a lot not kept answers not kept, nothing written; prints <name> no longer kept and, for a committed or canceled lot whose worktree or branch is left, next: lot prune <name>",
			"station - appends one station event (by: host) to the lot's events.jsonl, never rewriting a line: start answers its run and the end command; end pairs with --run, else with the one open start of its station, step, round and attempt (several: refused), else repeats the last such end carrying a cost field with the same fields (already, nothing written), else is recorded alone (started: null); --event <id> again answers the first event (already) or is refused when its fields differ; start is refused on a committed, canceled or failed lot, end is accepted in every state; a simulated lot writes simulated: true; text fields refuse control, line-break and direction characters, vendor, model, tier, effort and session at most 80 characters, step, round and attempt 1-999, tokens, runs and duration non-negative, at most 50 skills (hash: sha256 of the path or of the synced <folder>/<name>/SKILL.md, else null), a verdict of approve, back, fix-then-repass, fixed, disagreed, answered, failed, limit; a line over 4,096 bytes is refused; --from takes the same fields plus phase (start|end) as one JSON object, unknown keys refused, every fault at once; --json { recorded: new|already, run, next }",
			'--by - one line, not empty, checked before the lot is read (answer and stop)',
			'<id> - an index (171 = 0171), a full name, a lot folder or .dialecte/lot; a write verb needs an index unique across every store of the store list, a word naming an existing folder is that folder',
			'exempt|accept|revised|gone|moved|mutation - write .dialecte/lot.json at the package root (tab JSON), keeping the rest',
			'moved - a case of the lot moved by a split or a rename of its file or describe after its red (its own title is part of its test call): two cases, or a file (never a glob) and the file or glob its cases moved to under the same names, several files into one each with its entry; tdd red carries the red (flag moved) when the test call and the test code it reads are as that red froze them and it does not pass on the base production, else refuses',
			'accept - a case is <file>::<name>',
			'revised - a file or a glob covers every case of its files',
			'--remove - drops the accept, revised, gone or moved entry written exactly so (a list left empty leaves the file); an entry its list does not hold is refused, naming the closest ones, nothing written',
			'mutation - absent: changed when the diff touches the declared scope, off otherwise; gate = changed that the hand-over waits for',
			'finding - appends R<n>-<k> open to <folder>/findings-ledger.md (made when absent)',
			"decide - rewrites that finding's state cell, every other byte kept",
			"snapshot - copies what git status lists to round-<n>/, the deletions to round-<n>.deleted, HEAD to round-<n>.base, { schema, at, stateHash } to round-<n>.state; the folder is a lot folder or stays outside every repository; -- ends the options; the risk class is derived again from the diff first and appended to risk.jsonl as a derived line only when the snapshot goes ahead, a refused snapshot writing nothing (a derivation that cannot run prints ! risk class not derived: <reason> and appends nothing); the cap of review rounds is the rounds of the higher of the effort's class and the class derived now (else the last derived line's) (low or light 1, medium 2, high 3; the effort is the last line of lot risk --effort, else the lot's; a class above the effort prints ! risk class now <class> (<reason>): cap <cap>); with no effort recorded the cap is 1 and a later round is refused (exit 2) naming dialecte lot risk <folder> --effort low|medium|high --by <who>; a round above the cap of an effort is refused (exit 2), naming what set the cap ((effort <e>), or (effort <e>, risk class <c>) when a class raised it), unless --beyond-cap --by <who> --reason <text> gives the go-ahead, written to decisions.md as round <n> beyond the cap of <cap>: <reason> before the snapshot (once: a retry finds it); --beyond-cap within the cap, --by or --reason without it, and --by or --reason holding a forbidden word are refused (exit 2), nothing written",
			'choice - appends | decision | who | yyyy-mm-dd | to <folder>/decisions.md (made when absent)',
			"standard - writes <folder>/standard.json (state, note, time), read by the card's standard line; outside (the lot's asks answered outside the documents, written by ask itself) warns, and fails at effort high unless the record's confirmed flag is true (written by ask once a person confirmed every outside answer; by hand false): the flag decides, never the note text",
			'delta - per file, the diff from round-<n-1>/ to the worktree now; --worktree adds a throwaway worktree holding round n-1 and prints its removal command; for a lot kept on purpose it prints kept by decision: <why> (by <who>, <date>): the throwaway stays with the lot instead, and --json carries kept and no removal',
			"recap - the <details> part of a pull request from the hand-over's records only; writes nothing",
			"verify - run inside the lot's worktree: appends { schema, at, by, note, state } to <folder>/verify.jsonl in one write, state the worktree's state hash; a change of the tree after the last round-<n>/ snapshot is a late fix: the card warns and handover run refuses it (exit 2) until a verify covers the current state (one later change needs a new verify); a snapshot with no round-<n>.state (an older cli) is not checked; no snapshot yet (nothing is late), --by or --note missing, blank or not one line, or holding a forbidden word are refused (exit 2), nothing written",
			"report - reads files only (no git, no process, nothing written): the lot's stations, tokens, money, time, suites per station by time, heavy steps, folders and review rounds from its events.jsonl, transitions, ledger and cards.log; a number nobody reported is unknown, never 0, and a step family whose runs may be unrecorded reads unknown with the reason; --feature lists every lot of that feature in every store (simulated ones counted apart, listed by --simulated; a lot whose folder is gone is read from its cards.log line), a kept lot marked kept; next: the lot's own next command, for a committed or canceled lot kept on purpose whose worktree or branch is left lot unkeep (prune would keep everything); a kept lot adds a kept line and kept in --json",
			'report --kept - every lot kept on purpose of every store of the list and of the folder it runs from, real, simulated and damaged, each read once and filtered on its keep first: <name>  <state>  kept since <date> by <who>: <why>  · worktree present|gone|unknown · branch present|gone|unknown, sorted by name, then <n> kept lot(s) (no kept lot: exit 0); next lot unkeep; --json { lots: [{ lot, state, kept, worktree, branch, next }] }; an id, --feature or --simulated beside it exits 2',
			"export - copies a lot folder to <dir>/<full name>/ without asks/ (links kept as links, those pointing outside it named), adding the lot's cards.log lines and registry entry; refused for a <dir> inside a git work tree and for an existing <dir>/<full name>; every copied file compared by size and sha256 (events.jsonl as a prefix) before the rename, one more copy on a difference; the source is never written",
			"prune - removes what a committed or canceled lot leaves behind, each item on its own proof: the lots named by id, else the lots of --feature in every store of the list, else every lot of every store (--all), else every lot of the store of the folder it runs from; base branches fetched first; per lot its line (state, landing) and one line per item - its worktree (the same proof as lot close: kept with why), its review throwaways (recorded by a step's throwaway-add, or cut by hand at a commit of the lot with no commit of their own: they go when every changed path is held by a commit, else kept naming the path held nowhere), its branch and its throwaways' branches; a lot kept on purpose (lot start --keep, lot keep) keeps every item, reason kept by decision: <why> (by <who>, <date>), before any proof, damaged or not; an open lot's items are kept, reason lot <name> <state>; a branch is kept while it is the base, the branch the main checkout is on, an open lot's branch, the stack parent of an open lot, a pending hand-over's or a stash's, while deleting it would lose a commit (a canceled lot's names its commits and the command to delete it anyway), and goes after its worktree when one checks it out; a lot whose worktree is gone and whose landing is not proven is listed stale with the command to stop it; without --yes the plan only; --yes acts in order (worktrees, throwaways, branches), each proof read again at the move, the lot's keep first (a keep, a damage or a folder gone since the plan keeps the item): a throwaway proved again after its move, a branch deleted at its proved tip only (git update-ref -d), a branch still parked in the trash listed waiting for the trash; a throwaway's --force removal starts only after its second proof, so a file written into it in that moment goes with it; a deleted branch is restorable with git branch <branch> <tip> (its removing line in cards.log holds the tip) until git's garbage collection, its upstream config is not restored; worktrees git refused to delete from the trash for more than ten minutes are listed with their git status and the forced removal, a throwaway its second proof left in the trash with why and the command that moves it back; a git read an item's decision rests on that fails keeps the item (could not read <what>: <git's error>), never reads as empty; ids, --feature and --all exclude each other; exit 1 when an item meant to go was kept (one another run removed since the plan is no failure), 2 for a usage error or an id that names no lot or more than one",
			"close - closes a lot or a hand-over: a hand-over of the registry (by name or index), or a lot (its id, name or index), with no registry entry needed; first the landing of every lot the arguments reach (the lot named, the lot an entry registers, the open lots naming an entry's worktree and branch) is read, with the host asked for every lot it reads (one never pushed by lot land, its branch deleted on origin after the merge, included): merged (its tip on the base, its pull request merged - the one landing.json names, else the newest of its branch whose head the branch reached, a pull request opened by hand included - or its work contained in origin/<base>, a squash read offline) writes its landed fact in <lot folder>/landed.json, commits its pending entry (a lot with none is closed as the lot itself: no registry entry is made) and every outcome reaching it carries the line landed on <base> at <commit>: <how>, landed in --json; a lot kept on purpose keeps its worktree, reason kept by decision: <why> (by <who>, <date>); a lot named by its id that is open is kept with lot <name> <state>: why (its work not in the base, its pull request closed, the commits it holds since part of it landed, or the host's silence); a lot whose branch and worktree are gone reads its landing from the latest card line of its own or of a hand-over on its branch whose entry names its worktree, written since the lot was made; a canceled lot closes, its landing never read; then for each committed or abandoned hand-over, and each committed or canceled lot named by its id: its final record first, the card line in the repository's cards.log (a catch-up one when none exists, for every hand-over of the worktree, read back), then a removing line, then its worktree moved to .worktrees/_trash/ and removed in the background by git worktree remove without --force (git refuses one written into since the check: it stays in .worktrees/_trash/), its node_modules parked in .worktrees/_pool-<repository>-<n>, its caches to their own _trash/ entries, then a removed line (trashed or kept); a commit dropped from its branch (reset or rebased away), held by the branch reflog alone, is named under the closed line: git expires it with that reflog (gc.reflogExpireUnreachable), as it would have with the worktree's; a landed or canceled lot's own lot files (its root .dialecte/lot link naming the lot's folder): the root's .dialecte/lot.json and each package's (the folder of a package.json git tracks, or one the lot deleted), archived in that folder first (lot prune and lot close --feature archive the same way), the root's as lot.json and a package's as lots/<package path>/lot.json, or lot.landed.json beside a lot.json holding other bytes, never over one and read back, kept naming both archives when both hold other bytes; every lot file it counted read again right before the move, one rewritten since keeping the worktree, nothing archived; a lot file is removable only when empty or byte-equal to an archive of its own package path; kept first when an open lot names it (reason lot <name> <state>), then with why when it is the main checkout, on another branch than the hand-over's, locked, another hand-over of the same worktree is neither committed nor abandoned, a link from outside it points into it, dirty, a landed lot holds commits made since its landing (<n> commit(s) made since its landing: <commits>), its removal would lose a commit (<n> commit(s) its removal would lose: <commits>: a commit only its HEAD or HEAD reflog reaches, that no surviving branch, branch reflog, tag, landed tip or remote-tracking ref holds, nor the same change at the same place (a commit of theirs with the same diff, its hunk line numbers included) - a commit made on a detached HEAD), it holds ignored files its removal would delete that nothing else holds (rebuilt folders, dialecte.rebuiltIgnored folders, the .dialecte/lot link, an empty or archived .dialecte/lot.json and copies byte-equal to the main checkout's go), a process or a mutation run works there, lot close itself runs from inside it, or the processes are not known, or the final record cannot be kept or the lot's commit is not known; the branch never touched; a hand-over already closed, or a lot whose worktree a recorded removal moved, answers already closed, exit 0, nothing moved (a lot whose worktree is gone with no such removal: nothing to close), its lot's landed fact still recorded when the host proves the merge (its landed line beside already closed); exit 1 when one is kept, 2 when a name or index is neither a hand-over nor a lot (the others are still closed)",
			"close - --feature <name> closes a feature at a pipeline's last step: its lots in every store of the list (simulated ones left out); none answers no lot of the feature, exit 1; a lot of it neither committed nor canceled refuses the whole close, listing each with its state, exit 2, nothing moved; else lot prune's plan without branches, acted at once (removing lines by lot-close): every lot worktree and recorded review throwaway of the feature closed on its own proof, branches untouched and not listed (lot prune removes them); then the rehearsal clones of the machine's scratch roots whose marker names a hand-over folder of a lot of the feature (its lot folder, or the folder of a committed or abandoned entry naming its worktree and branch): a dead one (its pid gone, or running with another start time) that no process works in and no link reaches (links read in this workspace and every workspace of the feature's lots; processes, links and keeps read again before the moves) moved to the workspace's .worktrees/_trash for its own .worktrees/_scratch, else its scratch root's dialecte-trash, with removing and removed lines (item clone); one alive, whose marker cannot tell (no marker, no pid, no start time, an unreadable one), a process works in, or the processes or links cannot be read, kept and named for dialecte worktree prune; a kept lot keeps every item, clones included, with its kept text; a clone of another hand-over is listed, never moved; --json { open, lots: [{ lot, state, landing, items: [{ item: worktree|throwaway|clone, name, decision, outcome }] }], clones: [{ clone, kept }] }; a lot name beside --feature is a usage error (exit 2); exit 0 when every item of the feature went, 1 when one was kept",
		],
		exitCodes: [
			'1  risk --effort: the line could not be written',
			'2  risk: usage; unknown id; a damaged store lot; --effort below the class without --reason, no --by, a forbidden word, a lot that is committed, canceled or failed',
			'2  start: an effort below the risk class without --by and --reason; --keep with a brief keep',
			"2  keep, unkeep: usage; unknown or ambiguous id; a forbidden word, a path, a link, a reference or a plan entry id; keep.jsonl unreadable; unkeep from the lot's own worktree or one of its review throwaways (-round-<n>, -verify)",
			'2  report --kept: an id, --feature or --simulated beside it',
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
			'What waits on someone across every lot store: health findings, questions for a person, questions for a caller, ready hand-overs, failed lots',
		usage: ['dialecte inbox [--repository <name>] [--simulated] [--json]'],
		notes: [
			'reads every store of the store list and the store of the current folder, and the cli scratch folders of the temporary folder, files only: first one line per health finding, red first (duplicate work, landing time and slow worktree adds of the last 24 hours; stalled runs, idle worktrees and leaked scratch folders as they are now), <✗|!> health  <repository>[  <lot>]  <rule>: <finding>  next: <command>; a red finding waits, an amber one is listed only',
			'then one line per waiting lot (one per open question), grouped person, caller, ready, failed and by index, each with its exact next command; then working <n> · simulated <m>; a lot whose records do not read is a damaged line',
			'--repository - the lots and the health findings of the repository folder of that name only (the basename, exactly), the counts too; the health of no other repository and no scratch folder is read',
			'--simulated - the simulated lots that wait are listed in their groups (they are only counted without it)',
			'--json - { waiting: the status of each waiting lot, working, simulated, damaged, skipped: the stores not read (only when one is), health: the findings (empty when none) }',
		],
		exitCodes: ['1  no lot waits, no lot is damaged and no health finding is red'],
		example: 'dialecte inbox --repository scl',
	},
	health: {
		family: 'Grow',
		summary:
			'What went wrong lately across every lot store: duplicate work, slow landings, stalled runs, idle worktrees and leaked scratch folders',
		usage: ['dialecte health [--since <date|duration>] [--repository <name>] [--json]'],
		notes: [
			'reads every store of the store list and the store of the current folder (each once), and the cli scratch folders of the temporary folder, files only: a header with the red and amber counts, then one block per finding (red first, newest first, idle worktrees and leaked scratch after the runs) with its detail lines and its next command; with no finding, one ok line naming the rules',
			'--since - the window of the duplicate work, landing time and worktree add rules: <n>h, <n>d, a date (its midnight UTC) or a date and time with its zone; default 7d',
			'--repository - the findings of the repository folder of that name only (the basename, exactly); the scratch folders, which belong to no repository, are left out',
			'--json - { since, findings, counts: { red, amber } }',
		],
		exitCodes: ['1  a red finding'],
		example: 'dialecte health --since 24h',
	},
	plan: {
		family: 'Plan',
		summary:
			"What can start now in a plan's lot block, whether the block is valid, a mark on an entry",
		usage: [
			'dialecte plan next <plan.md> [--json] [--all]',
			'dialecte plan check <plan.md> [--json]',
			'dialecte plan mark <plan.md> <id> done --by <who> [--reason <text>]',
			'dialecte plan mark <plan.md> <id> done --landed <sha> --by <who> --reason <text>',
			'dialecte plan mark <plan.md> <id> superseded --by <who> --reason <text> [--replaced-by <id>]...',
		],
		notes: [
			"the block - one fenced ```json dialecte-lots block in the plan, or the file <plan without .md>.lots.json beside it (both or neither: refused); each entry's id, kind (lot, fix, spec, person), dependsOn, scope per repository, heavy steps, brief and match (branch, handover, feature); unknown keys refused, every fault at once",
			'next - proposes only, starts and writes nothing: the state of each entry read from the stores, the hand-over registries and the worktrees of its repositories (files only, no git process: a lot reads committed by its registry entry or its landed fact, landed.json, which lot land, lot close and worktree prune write once its landing is merged), the open lots, the lots that can start in critical-path order (shares:, merge:, unverified, stacks, next command), the held ones with each scope pair met (a ready lot meeting an open lot is proposed with shares: <pair> (<lot>, forecast clean) when the last forecast that lot recorded is known and shows no conflict inside the met entries; it stays held on a met lock file, a conflict inside the met entries, or an open lot with no known forecast; two ready lots that meet are both proposed), the landed lots (lot <name> committed: hand-over committed in <folder>, branch on <target>; until lot close closes that hand-over), person entries without a mark, the spec work, what each entry waits for, the parked ones, the live heavy steps with the load against twice the cores and the available memory against 2 GB (advice only); --all lists the done entries; --json { plan, repositories, counts, entries, proposals, held, landed, specWork, heavy, unknown }',
			'check - the block parses and every repository is a git main checkout (two names for one common folder refused); one line when valid; --json { plan, valid, faults }',
			"mark - a person entry only: appends { plan, id, state: done, by, reason, at } to <state>/dialecte/plans/<sha256 of the plan's real path, 16 hex>.jsonl, once (again: already); per machine; --landed <sha> for a lot or fix entry landed outside the lot store (a lot landed by hand, or stopped after its work landed in another lot): one --landed per repository of the entry (<repository>:<sha>; a bare <sha> for an entry of one repository); origin fetched, each commit must be on origin's base branch of its repository and change a path of the entry's scope there; the mark records { landed: [{ commit, repository }] } and the entry reads done by them (realizedBy kind landed); an entry its records already say done takes none (answered, nothing recorded); a lot or fix entry takes no plain mark, a person entry no --landed",
			'mark superseded - an entry of any kind other entries replaced: appends { plan, id, state: superseded, by, reason, at, replacedBy } (each --replaced-by an id of the block, never the entry itself; replacedBy [] when none is given), once (again: already); --reason required, --landed refused; the entry reads done (realizedBy kind superseded, name the --by), so nothing waits on it; the replacing entries do not take over its dependents (a dependent that needs their work names them in its dependsOn); --all lists it as <id> (superseded by <ids>); an entry its records already say done takes none (answered, nothing recorded)',
		],
		exitCodes: [
			'1  next: no lot or fix can start now (spec work may still be listed)',
			'2  usage; no block or an invalid one (every fault listed); a repository that is not a git checkout; mark: a lot or fix entry without --landed (or without --reason), a person entry with it, a commit not on the base branch of origin, an unknown id; superseded without --reason, with --landed, or a --replaced-by not in the block or the entry itself; --replaced-by with done',
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
			"in a lot's own worktree, --fast and --full end with the lot's conflict forecast against main and every open lot (as lot forecast, recorded with trigger gate): forecast: <verdict>, then one ! <against>: <why> line per comparison it does not clear, said before the notes and the verdict; --json adds forecast { verdict, lines }; a warning only, the gate's verdict and exit never change; none in a review throwaway, none for --release",
			'a failing vitest test step is rerun once, serially, on its failing files: passing there it is flagged flaky in parallel',
			"the default lists end with a scoped rules step (dialecte rules); a step whose run starts with the word dialecte runs as the gate's own cli (its node and entry file, never node_modules/.bin), its line ending (dialecte <version>); a missing dialecte bin fails that step, never the gate",
			'a green record of the same tree, install and steps answers the steps after a fresh tdd step; --no-reuse runs them',
			'--full and --release hold the machine awake while they run (macOS: caffeinate -i -w <pid>; DIALECTE_KEEP_AWAKE=0 turns it off); a run that spanned a sleep keeps sleptMs on its record and the card says it',
			'--hook - in a commit hook, no test suite (CI runs it on every push): with "dialecte.gate.hook" declared, the tdd receipts of the lot first (every new or changed case since the lot base proven red then green, unchanged, accepted or revised, its newest green at the production as committed; a stale green names dialecte tdd green (measured from the lot base); a first or merge commit skips it), then the declared steps (the cli: check, then rules on the touched files); without one, every step of --full, a scoped one against the hook base; each step answered by a green record (any mode) of the committed tree and install that ran it as it is now, else run; the running line names the steps it runs',
			'--release - alone: "dialecte.gate.release" (default: the --full steps), every scoped step against the empty tree (--base feeds only the tdd step); records dialecte-gate-release.json; each of its steps answers a hook step of the same step hash (a scoped one at any base: it checked everything); its green record answers a rehearsal, contrib and the card when the list covers full (same name, run, counts and changedOnly for every full step)',
			'scoped steps ("scoped": true) get DIALECTE_GATE_BASE, _TREE, _CHANGED (the changed paths byte for byte, NUL-separated, relative to the repository top as git diff --name-only names them; a declared failing path is relative to the package root) and _SELECTION, where they write { schema: 1, base, tree, changed, selected: [{ id, reasons }], skipped: [{ id, reason }] } (both lists required, reasons non-empty); the base is --base <ref>, else the merge-base with the base branch (the first found: "dialecte.baseBranch", origin/HEAD, main, master; each local, else on origin), else the empty tree; a local base branch holding commits origin\'s lacks: a note naming the count, the base read from origin\'s; select from the working files; without the gate (no DIALECTE_GATE_SELECTION): select everything',
			'a step whose run is npm run <script> the package lacks is not wired: a default step fails a --full or --release run (a --fast one says it and goes on), a declared step fails in every mode; then no step runs, the others read not run: a step of the list is not wired; "dialecte": { "gate": { "skip": { "<default step>": "<reason>" } } } (dialecte.gate.skip) opts a default step out, a warning with its reason',
			'a scoped step: an empty selection exits 0 without starting vitest (nothing selected since <base> (<n> paths changed)); a non-empty one on a counts: "tests" step that runs no test fails; a failed scoped step counting tests is rerun once serially on a test failure (a failed test, a FAIL line, vitest\'s error markers), whatever runs it: the failing files (after -- through npm run), then --no-file-parallelism, and it must select the same ids (one vitest invocation, or --passWithNoTests on each); the selection may declare "failing": [paths relative to the package] the record keeps with the ones the output names; "heavy": true marks a heavy suite, outside the command hash',
		],
		exitCodes: [
			'2  an option the usage lines do not name, or --base / --declare given last without its value: the usage printed (--json: { error, usage, next: null }); no step run',
		],
		example: 'dialecte gate --full',
	},
	tdd: {
		family: 'Check',
		summary:
			'Receipts that each new test failed on an assertion before the code, then passed untouched',
		usage: [
			'dialecte tdd red [<test file>]... [--base <ref>] [--json]',
			'dialecte tdd green [<test file> | <test file>::<case name>]... [--base <ref>]',
			'dialecte tdd status [--base <ref>] [--json] [--flags] | tdd status --legend',
		],
		notes: [
			"red - every case of the changed test files must fail on an assertion (or a stub's 'not implemented' inside an asserting expect); a passing new case, a missing export, a type or syntax error, a timeout, a .only is refused; the files without a refusal are frozen",
			'green - each case with a red receipt, its test code as frozen, production changed since its red, passes; records a green receipt',
			'status - per case red, green, unchanged, missing receipt, test edited after red, flags',
			"base - the change is measured from the lot base: HEAD's fork point from the base branch (the newer of the local branch and origin's), or from an open stack parent's line; HEAD only when no base branch is found; a green taken before a rebase still counts after it",
			'--base - measure from where HEAD left the ref given instead of the lot base',
			'declarations - a gone or moved entry of the lot file naming a path the change leaves unchanged, or one known nowhere (not at the base, not now, not in the receipts), is refused before any run, naming its lot gone --remove or lot moved --remove; a test file deleted on disk is a deleted file, never read',
			'--legend - the tdd terms of the hand-over card',
		],
		exitCodes: [],
		example: 'dialecte tdd green',
	},
	rules: {
		family: 'Check',
		summary: 'Code-rules self-check of the changed files (syntax tree, not greps)',
		usage: ['dialecte rules [<files...>] [--json]', 'dialecte rules --base <ref> [--json]'],
		notes: [
			'types / constants in their files, named functions, no await in an argument, object parameters, full words, no standard citation (nor, in a contributor profile, a plan tag, acceptance criterion or ticket number); temporary-root-shared; raw-git-repository on test and test support files (a git clone / git init argument list in a git call, init --bare aside: make the repository through a test helper that gives it an identity; allowable); bare-tmpdir on production files (every temporary folder under one scratch root; allowable); their messages name the cli helpers only in the cli',
			'a contributor: no consumer name nor forbidden word (git config dialecte.forbiddenWords and $XDG_CONFIG_HOME/dialecte/forbidden-words, else ~/.config/dialecte/forbidden-words; whole words, any case); no list: one line, and the check is not run',
			'without files: the changed list a scoped gate step hands (DIALECTE_GATE_CHANGED), else the files changed against HEAD and the new ones; a file it cannot read or parse is an error',
			'quality rules: argument-mutation, query-in-loop, long-function on implementation files; table-branch, without-export-xml, export-without-queries, fixture-builder, plan-tag on test-shaped files; on test-shaped Dialecte changes: xml-splice, xml-replace, transaction-spy, act-repeats-call, act-snapshot, act-format-check, inline-document-long, expected-fixture, fixture-case-comment (warning), test-file-long, fixture-file-long, fixtures-module, fixture-builder an error; in an app only Dialecte-change script files are judged, the others counted in one line (a contributor package is never an app); with the gate base, an error on a line the change did not add is a warning; without a gate base, or with an empty-tree one (as gate --release hands), the order every caller shares: in the worktree of a store lot its lot base read from git (its fork point from the base branch, or from the line of the lot it was started on while that lot is open; never the base recorded at its start, which a rebase leaves behind; with no base branch found, the newest of the commit it recorded at its start, when HEAD holds it, and a release tag descending from that commit, else no base), else the merge-base with the base branch (skipped, for an empty-tree base and for a run without a gate base, when it is the commit of HEAD), else the last release tag <name>@v<version>, else no base and every error kept; a lot base that cannot be read (its stack parent unreadable) is no base, never the merge-base, said in a rules: no base (<why>) line by every run that reads the order: without a gate base, with an empty-tree one, and on the contrib rules row; a run without a gate base prints one line naming it (rules: base <sha> (the lot <name> | the merge-base with <branch> | the merge-base with the base branch | the release tag <tag>), or rules: no base (<why>) when the lot base cannot be read)',
			'changelog-edit (an error), in a package keeping a changes/ folder: CHANGELOG.md edited without the package version bumped; write the entry in changes/<lot>.md (dialecte changelog)',
			'released-changelog (an error, no opt-out), on CHANGELOG.md in every package: a released ## [<version>] section the change altered - lines added, removed or reordered, the section removed, or its heading repeated - judged against the base branch and where the change left it (a section main corrected after the branch point, or a release the branch predates, is no finding); the release base a rehearsal hands its hooks (DIALECTE_RELEASE_BASE, to the scoped rules step alone) replaces the base branch; no base branch: one line, not judged (--json: releasedChangelogNotJudged)',
			'--base <ref>: the files changed from the merge-base of <ref> and HEAD to the worktree are judged (deletions left out; uncommitted ones in), that merge-base the base of the softening as a gate base would be; files given with it, or a ref naming no commit, exit 2',
			'base-aware rules (warnings, against the base the run judges the change from: --base, else the lot base, else, in a run that is no scoped gate step, the base branch merge-base; never a release tag, an empty tree nor the gate base): duplicate-read, an added function reading the same element and three or more attributes as an existing one (a named set counts three), or whose name shares two words with an existing function it does not call (generic words such as read, list, file, path or name left out); shared-export-changed, an export imported by a file of another folder (a sub-folder included) newly shared, re-signed (its parameters, return type, or a sibling .types.ts type they name), its body changed, or removed; docs-not-updated, in a contributor library (no bin), a public api.json entry added, re-signed or removed whose doc page (doc/ Markdown or README naming its last two route segments, or its whole route in a code span) the change did not touch; one line names where they stand: quality: since <short> (lot | base-branch | flag), quality: not run (no lot) in a scoped gate step outside any lot, no line when there is no base or no package.json; notes under it: public API: <route> removed: still named by <pages>, ! public API unknown (<why>), aliases changed, when a tsconfig or Vite config changed (the base edges read with the aliases of the tree); a run that judged the whole change writes dialecte-quality.json in the worktree git folder; contrib never runs them',
			'--json: dialecteChanges (the verdict of each file), notJudged, baseLine, qualityLine, quality (the base, the examined files, duplicates, sharedExports, publicApi, docs); described by rules.schema.json (schema 1)',
			'opt-out: // dialecte-allow <rule>[, <rule>]: <reason> (15 characters at least) on the line or the line before (for argument-mutation, long-function also in the comments before the function, its doc comment included; for act-repeats-call, act-snapshot, act-format-check inside an act also the line before the act); fixture-file-long: <!-- dialecte-allow fixture-file-long: <reason> --> on the first line of the fixture; invalid-allow, unused-allow; --json counts the findings silenced per rule in allowed',
			'an API index that cannot be read: query-in-loop does not run, one line names the file and why',
			'not judged: an alias of a parameter or of a query (aliases are not followed); query-in-loop is syntactic and one level (a read in a function the loop calls is not seen); a table imported from a sibling file; plan-tag flags round, step or station followed by a number in a title (reword it, or opt out); fixture-builder reads a <word> placeholder in a template string as XML (opt out); act-repeats-call counts a call after an early-return arm that makes the same call as two; a *Query-named binding that is no query, or a run with no readable API index (no core groups), can make a unit of a call chain',
		],
		exitCodes: [],
		example: 'dialecte rules src/commands/lot.ts',
	},
	contrib: {
		family: 'Check',
		summary: 'The contributor checks of a dialecte package (profile contributor)',
		usage: ['dialecte contrib [--no-reuse] [--json]'],
		notes: [
			'after gate --full and before handover: rules on the changed files (against the base of the lot, the order the rules step of the gate shares: the lot base of the store lot read from git (its fork point, never the base recorded at its start), else the merge-base with the base branch, as the rules step of the gate takes it, else the last release tag <name>@v<version>, every error kept without any; a rehearsal against the tip its last merge lot merges, else the gate base of the repository at the HEAD of the lots file: an error on a line the base holds is a warning), the "dialecte": { "contrib": { "steps" } } (default: npm run doc:build with the generatedDocs restored, npm run type-bench:check), the type-bench step alone handed the base of the change in DIALECTE_CHANGE_BASE (the base of the rules row when it is a commit; a rehearsal hands the tip its last merge lot merges, else the lot base of its repository, and with neither does not run that step), npm run type-narrowing when the package has that script and no step runs it (a skip line when it lacks it), no dependency named by a local folder, the mutation line when a scope is declared',
			"the changelog row (after rules): first the released CHANGELOG.md sections, on every run, changed by the lot or not (a merge brings them): a section altered against the base branch and where the change left it fails the row, naming it (rules: released-changelog); the record is keyed on the base's and the merge-base's CHANGELOG.md, so a release on main runs the row again; then in a package keeping changes/, a change that edits README.md, a page under doc/ or a file the package lists in dialecte.changelog.asking (a folder ends in /; the cli lists its command map) adds a changelog fragment changes/<lot>.md, or a no-entry note changes/<lot>.none.md saying why; else it fails naming the file",
			'a step a green gate --full of this tree and install passed with the same command is not run again; --no-reuse runs every row',
			'a step whose run is npm run <script> the package lacks is not wired: it fails, default or declared; then no row runs, the others read not run: a step of the list is not wired; "dialecte": { "contrib": { "skip": { "<default step>": "<reason>" } } } (dialecte.contrib.skip) opts a default step out, a warning with its reason',
		],
		exitCodes: ['2  refused in a consumer (nothing written)'],
		example: 'dialecte contrib',
	},
	changelog: {
		family: 'Check',
		summary:
			'Changelog fragments (changes/<lot>.md): check them, or fold them into CHANGELOG.md for a release',
		usage: [
			'dialecte changelog check [--base <revision>]',
			'dialecte changelog release <x.y.z> [--date YYYY-MM-DD]',
		],
		notes: [
			'a fragment: one changes/<name>.md per lot (a no-entry note changes/<name>.none.md holds why a visible change has none), its entries under the changelog headings ### Added, Changed, Deprecated, Removed, Fixed, Security; a package keeping a changes/ folder edits CHANGELOG.md only in a release (rules: changelog-edit)',
			"check - every fragment readable (a known heading, no loose text, no empty or repeated section), the Unreleased part of CHANGELOG.md, then its released sections: none altered against the base branch and where the change left it (rules: released-changelog); --base <revision> judges against that commit alone, the one the change goes onto (the CI check step hands the merge queue's base, or a pull request merge ref's first parent)",
			'release - writes ## [<x.y.z>] - <date> (default today, local) under an emptied ## [Unreleased] (written above the first version when missing): the Unreleased summary and entries first, then each fragment in file name order, section by section, one entry per line; deletes the fragments and the no-entry notes; nothing written when a fragment or the Unreleased part cannot be read',
		],
		exitCodes: [
			'1  a fragment or the Unreleased part cannot be read, a released section is altered (check), the release is refused (no CHANGELOG.md, version already there, nothing to release), or a fragment could not be deleted',
			'2  usage: no verb, a version that is no x.y.z, a date that is no YYYY-MM-DD; --base names no commit of the repository',
		],
		example: 'dialecte changelog release 0.8.0',
	},
	ci: {
		family: 'Check',
		summary:
			'The CI files shipped as a template: write them into the package, report drift, run the publish guard',
		usage: ['dialecte ci sync [--dry-run]', 'dialecte ci check', 'dialecte ci publish-decision'],
		notes: [
			'the template: the workflows (ci.yml, publish.yml and their reusables), .github/pull_request_template.md, .nvmrc and changes/.gitkeep; ci.yml selects its jobs from package.json: type-perf with a type-bench:check script (its bench step handed the base the change goes onto in DIALECTE_CHANGE_BASE: the base sha of the merge queue, else HEAD^1, skipped on a dispatch), docs with a doc:build script, the Playwright install with a playwright dependency, the npm run skills:check step of the check job with a skills:check script; the check job always runs rules --base of the cli over the change (the base sha of the merge queue, else HEAD^1, skipped on a dispatch), where --no-verify cannot skip it; a build script is required (publish.yml builds the package)',
			'the repository owns .github/workflows/_test.yml (ci.yml calls it: a workflow_call trigger; a mode input of type string gets pr on a pull request, full in the merge queue) and every other workflow file the template does not name; they are listed, never written',
			'sync - writes what differs from the template, deletes the retired files (pr.yml, _lint.yml) and the reusables no job of the package calls; an update prints its diff; a second run is in step; --dry-run writes nothing',
			"check - the same comparison, read-only: each drifted file with its diff, then the fix; the template's _check.yml runs it on every pull request",
			"publish-decision - the publish guard of the push to main (BEFORE, GITHUB_OUTPUT): publish above npm's latest, a pre-release under next, a missing release tag pushed alone, a failed npm query refused",
			'publish.yml keeps its name and its push trigger: npm trusted publishing names the file',
		],
		exitCodes: [
			'1  sync: the own _test.yml is missing or breaks the contract (the managed files are written); check: drift or a broken contract; publish-decision: refused, or BEFORE, GITHUB_OUTPUT, package.json or git failed',
			'2  usage, no package.json, a package.json with no name or no build script',
		],
		example: 'dialecte ci sync --dry-run',
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
			'dialecte handover run [<name|folder>] [--rehearse [--keep] [--full]] [--resume-merge] [--not-a-lot --by <who> --reason <text>]',
			'dialecte handover abandon [<name|folder>]',
			'dialecte handover list [--root <dir>] [--json]',
			'dialecte handover --legend',
		],
		notes: [
			'write - the hand-over folder (lots.json, snapshot, one-line commit.sh) and its card, registered in <git common dir>/dialecte-handover/<name>.json under the real path of the folder; handover <lots.json> is the same; --out <id> writes into the lot folder, refused (exit 2, nothing written) for a simulated, canceled or failed lot, an open question, a lots file of another worktree or branch; any folder whose hand-over is committed is refused',
			'write --target <branch> - the branch the lots land on, recorded as target in lots.json (default: the base branch resolved at write time); a branch with neither a local nor an origin ref is refused (exit 2, nothing written)',
			'show - the card again, recomputed, nothing written; without an argument the newest of the branch; BLOCKED with a ! line when the target branch moved past the hand-over (merge it first); BLOCKED with a ✗ processes line naming the processes left running in the worktree (no terminal, not under an editor, not named in git config dialecte.personProcesses); BLOCKED with a ✗ merges line when a merge lot not committed yet has no recorded tree, worded as run refuses it',
			"review - opens the hand-over's worktree in a new editor window, started detached (a hand-over holding a merge lot first writes review/lot.diff, the lot's change against head, and opens it too); the editor: git config dialecte.editor in the worktree (its words, no flag added), else the first known editor found on PATH, else code; never $EDITOR; --print prints the command line and starts nothing, --json answers { editor, command, opened }; refused (exit 2) for an unknown hand-over, a worktree that is gone, an editor not found",
			"run - what commit.sh runs: each guard with its time, each lot announced, the hook live, the card; without a folder the one registered hand-over still to run; --rehearse commits in a scratch clone; refuses a canceled lot (exit 2); the lot guard refuses a hand-over folder that is not a lot of the store (exit 2) unless --not-a-lot --by <who> --reason <text> gives the go-ahead, recorded first as a not a store lot: row of its decisions.md (an existing row counts), and always a simulated or damaged lot; a rehearsal prints ! and goes on; holds the machine awake while it runs, and a run that spanned a sleep says so on the DONE card; a run that committed lots archives every non-empty lot file of the worktree (the root's and each tracked package's) in the folder, lots/<package path>/ for a package, lot.landed.json beside a lot.json holding other bytes, and empties it; a run that committed none leaves them as they are",
			'abandon - marks a hand-over that will not run (abandoned.json) and releases its lock; refuses a lot folder (exit 2): rewrite it with write --rehash --out <full name>, end the lot with lot stop',
			'list - every hand-over folder: repository, worktree, branch, lots, age, state',
			'--legend - every term of the card, what it means, whether to look',
		],
		exitCodes: [
			'2  every verb: an option its usage lines do not name, or a value option given last without its value: the usage printed (--json: { error, usage, next: null } where the verb takes --json); nothing read or written',
			'2  run: the target branch moved past the hand-over (merge it first) or has no ref, a process left running in the worktree or a process list not known, a gate config the cli cannot run, a canceled lot, a hand-over that is not a lot of the store (without --not-a-lot), a simulated or damaged lot, --not-a-lot without --by and --reason (or --by/--reason without it), a forbidden word in --by or --reason; nothing committed',
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
			'dialecte worktree prune [--root <workspace>] --reclaim [--dry-run] [--older-than <days>]',
		],
		notes: [
			"add - under the workspace's .worktrees/: hooks folder, the links its file: and link: dependencies need to sibling checkouts, node_modules taken from the pool when an entry matches package-lock.json's lock key, else a near entry (at most 5 packages off) completed by npm install --prefer-offline --no-save, else npm ci, a copy-on-write copy only when npm ci fails (the reason on the card), read against package-lock.json (the npm ci to run when it differs), hygiene baseline",
			"prune - merged worktrees and branches, committed hand-overs, rehearsal clones: the commands with their cd; a worktree whose folder is gone is kept while its HEAD reflog holds work nothing else does (git worktree prune would delete that reflog), and git worktree prune waits while one is kept; a store lot's items (its worktree, its review throwaways <lot worktree>-round-<n> and -verify, its branch and theirs) are never removed here and no landing is read: an open lot's are kept, reason lot <name> <state>, a damaged lot's are held, reason its keep or lot <name> damaged; a committed or canceled lot kept on purpose holds them as an open lot does, reason kept by decision: <why> (by <who>, <date>); any other committed or canceled lot's are listed lot <name> <state>: its own item, removed by dialecte lot prune <name>; a worktree whose branch's work is not in the base is kept (not landed: its work is not in <base>); a worktree or a branch whose removal would lose a commit is kept with its commits (<n> commit(s) its removal would lose: <commits>; a surviving branch, branch reflog, tag, landed tip or remote-tracking ref holds a commit, or the same change at the same place (a commit with the same diff, its hunk line numbers included); deleting a branch takes its reflog); a worktree a process works in is kept (a process works in it: pid <pid>; processes not known: kept with why); ignored entries are read as lot close reads them: rebuilt folders, .dialecte/ views and copies of the main checkout's files go, anything else keeps the worktree (ignored files git worktree remove would delete: <paths>); a rehearsal clone is kept while its marker is missing or unparsable, or its pid runs; --yes runs them after a confirmation on a terminal; committed hand-over folders and finished rehearsal clones go to the trash like the other items (the workspace's .worktrees/_trash for a clone in its own .worktrees/_scratch, else the scratch root's dialecte-trash): the plan shows the move (mkdir -p <trash> && mv <folder> <trash>/), --yes makes it; a move that cannot be made is a ✗ line, nothing deleted; the pool (.worktrees/_pool-<repository>-<n>) and the trash (.worktrees/_trash/) are counted, never touched",
			"prune --reclaim - every worktree idle for --older-than days (default 2: no write to its index, HEAD or reflog since), not the main checkout, not locked, named by no open lot (a failed lot keeps) nor lot kept on purpose (its review throwaways are reclaimed as an open lot's) nor open hand-over, worked in by no process, reached by no link: its node_modules parked in the pool when its lock key is the main checkout's and it installs that lock, else sent to .worktrees/_trash/, its code never touched, a -round-<n> review throwaway's too; a node_modules that is a link is never moved; every rule checked again just before each move; one line per worktree, the total (worktrees, files, size) last; --dry-run moves nothing; --dry-run or --older-than without --reclaim, or an --older-than that is no positive whole number, exit 2",
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
		usage: [
			'dialecte doctor [--json]',
			'dialecte doctor --brief',
			'dialecte doctor --host [--vendor <name>]',
		],
		notes: [
			'what to fix before trusting what you read',
			'--brief - the session-start form, nothing when in sync, one line per problem',
			"--host - runs every read of the repository's host once, for real, through the cli's own code (the newest merged pull request, its checks and queued state, a reference pull request's line comments, the stack extension), then the tool versions against the recorded ones and git against its floor; only those lines; network by name; --vendor <name> probes that vendor whatever the origin",
		],
		exitCodes: [
			'1  a warning',
			'0  --brief, always',
			'1  --host: an error (a read refused, a changed answer, git below its floor, no vendor); a warning (nothing to probe, a part not installed, an older tool) never fails',
			'2  --host: usage (--vendor given without a vendor name)',
		],
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
			'dialecte skills sync [--agent claude,copilot,agents] [--copy] [--from <workspace>] [--contributing | --no-contributing] [--vendor <id>] [--no-session-check] [--agents-file | --no-agents-file]',
			'dialecte skills generate [zero-config flags]',
			'dialecte skills check [--workspace <dir>] [zero-config flags]',
			'dialecte skills changed [--base <ref>]',
		],
		notes: [
			'sync - install the consumer skills of your dependencies (or of local checkouts) for your agents; --contributing adds the contributor skills, remembered until --no-contributing; remembers the model vendor; with the contributor skills, a doctor --brief session-start check in AGENTS.md and the station agents (--no-session-check leaves the check out); a missing AGENTS.md is created only on a yes or with --agents-file, the section is never removed, and --no-agents-file leaves AGENTS.md alone',
			'generate - rewrite the generated blocks (verb map, method index, hook files) from the source',
			'check - fail on a cited API / path / npm script / cli invocation that does not exist, or a stale block',
			'changed - per skill, hand-written change (evals due) or generated blocks only',
		],
		exitCodes: [],
		example: 'dialecte skills sync --agent claude',
	},
	corpus: {
		family: 'Workspace',
		summary: 'The open-licence corpora fetched into a cache, and the licensed ones of config.yml',
		usage: [
			'dialecte corpus fetch [<id>...] [--json]',
			'dialecte corpus list [--json]',
			'dialecte corpus check [--json]',
			'dialecte corpus add <name> --xsd <path> [--instances <folder>]',
		],
		notes: [
			'fetch - the sources of the shipped manifest (every one, or the ids named): each refused without its licence, terms and a known verdict, with an id that names an entry of the cache itself, or with a download not pinned by a sha256; each download (no redirect followed, at most 512 MiB, aborted after 120 s without data) checked against its pin (a kept one in _downloads/ first, so a run without network rebuilds), its archive members kept and stripped (at most 1 GiB inflated), a member outside its folder refusing the source, then exclude, marker, substitute and wrappers; written to <cache>/<id>/ and named in manifest.lock.json once in place; a refused source changes nothing of what it had; one fetch writes a cache at a time (fetch.lock: another running fetch refuses the run); the cache: $DIALECTE_CORPORA_DIR, else corpora/ in the cli cache folder ($XDG_CACHE_HOME/dialecte, else ~/.cache/dialecte); never committed',
			'list - every open source (fetched; stale: from another manifest entry, without a lock entry the cli reads, or a locked file gone; or missing) and every licensed entry of config.yml corpora: (present or missing), with its verdict, entry schemas, instances (a folder and its globs) and instance count; exit 0 whatever is missing; --json (version 1) is the reader for a validation tier',
			'check - a fetched source whose files no longer match its fetch (edited, missing, added) or its manifest entry, and a licensed entry whose files are missing, one line each',
			'add - writes corpora.<name> of the personal config.yml with absolute paths, its comments kept; refused for a name holding a dot or a path that does not exist',
		],
		exitCodes: [
			'0  list: whatever is missing',
			'1  fetch: a source refused; check: a problem named',
			'2  fetch: an unknown source id; add: no --xsd, a name holding a dot, a path that does not exist; a refused config.yml',
		],
		example: 'dialecte corpus list --json',
	},
	bench: {
		family: 'Maintain',
		summary:
			'Measure the type-instantiation cost of the change against its base (tsc --extendedDiagnostics); --check to gate it',
		usage: ['dialecte bench [--check] [--base <ref>] [zero-config flags]'],
		notes: [
			'the head (the working tree) against the base it goes onto, measured fresh: --base <ref> (its merge-base with HEAD), else DIALECTE_CHANGE_BASE (the base CI and contrib hand: a revision read as its commit), else the order rules shares (the lot base of the store lot read from git, else the merge-base with the base branch, HEAD itself on the base branch, else the last release tag <name>@v<version>); nothing is stored, no baseline is written',
			"the base is exported at its commit into a scratch folder (no worktree), its file: siblings linked, its node_modules the head's when they install its lock, else npm ci; both trees are measured with the head's compiler and the head's probe generator, one run per scenario, and the base removed after",
			'tsgo (TypeScript 7+) runs with one checker (--checkers 1), so a file set always gives the same count',
			'each scenario within 5% of its base, a gain, over, new or gone; a row over is explained by a line the change adds to its changelog fragment (- Type cost: <why>) or no-entry note (Type cost: <why>), else --check fails',
			'no base outside CI and outside a lot: the head alone, nothing compared; dialecte bench --base <name>@v<x.y.z> reports the cost since a release',
		],
		exitCodes: [
			'1  --check: a scenario over 5% of its base that no type-cost line of the change explains',
			'2  refused: a base that cannot be read or is no commit, a lot with no base, no base in CI with --check, a head whose node_modules does not install its lock, a head with no version, a base tree that cannot be made or measured, method discovery failing at the head with --check',
		],
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
