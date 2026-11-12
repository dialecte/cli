import type { FailureKind } from './tdd.types.ts'

/** The receipts of a worktree, in its git folder: never in the tree, never committed. */
export const TDD_LEDGER_FILE = 'dialecte-tdd.json'

/** The kinds a move stays within: a test file moves to a test file, other test code to other test code. */
export const TEST_FILE_KIND = 'test file'
export const TEST_CODE_KIND = 'test code'

/**
 * The message a stub throws until the implement station writes it: `throw new Error('not implemented: add')`.
 * Any error whose message starts with it is the stub's, whatever its class.
 */
export const NOT_IMPLEMENTED_PATTERN = /^not implemented\b/i

/** The failures that count as a red. */
export const RED_KINDS: readonly FailureKind[] = [
	'assertion',
	'not-implemented',
	'error-in-production',
]

/** vitest's message for a test or a hook that ran out of time. */
export const TIMEOUT_PATTERN = /^(Test|Hook) timed out in \d+ms/

/** `mul is not a function`: the name the test called. */
export const NOT_CALLABLE_PATTERN = /^(\S+) is not a (function|constructor)\b/

/** A module import that names an export the module does not have. */
export const MISSING_EXPORT_PATTERN = /does not provide an export named/

/** The transform of a file failed on its syntax. */
export const SYNTAX_FAILURE_PATTERN = /PARSE_ERROR|Transform failed|SyntaxError|Unexpected token/

/** Calls that assert: the stub's error counts as a red only when thrown from inside their arguments. */
export const ASSERTION_CALLEE = 'expect'

/** Test files: what vitest includes by default. */
export const TEST_FILE_PATTERN = /\.(test|spec)\.[cm]?[jt]sx?$/

/** Test code beyond the test files: helpers and fixtures in a test or fixture folder, snapshots. */
export const TEST_FOLDER_PATTERN =
	/(^|\/)(test|tests|__tests__|__fixtures__|fixtures|__snapshots__)\//

/** A snapshot file, wherever it is. */
export const SNAPSHOT_FILE_PATTERN = /\.snap$/

/** vitest's message for a snapshot that does not match its stored value: a failed assertion. */
export const SNAPSHOT_MISMATCH_PATTERN = /^Snapshot `.*` mismatched/

/** The functions that declare a test case. */
export const CASE_FUNCTIONS: readonly string[] = ['it', 'test']

/** The functions that group test cases under a title. */
export const SUITE_FUNCTIONS: readonly string[] = ['describe', 'suite']

/** The modifiers called with a table before the call taking the title (`it.each(table)(...)`): a format title. */
export const TABLE_MODIFIERS: readonly string[] = ['each', 'for']

/** The modifiers called with a condition before the call taking the title (`it.skipIf(condition)(...)`). */
export const CONDITION_MODIFIERS: readonly string[] = ['skipIf', 'runIf']

/** The functions a focus marker (`.only`) narrows a run with. */
export const TEST_FUNCTIONS: readonly string[] = ['it', 'test', 'describe', 'suite', 'bench']

export const ONLY_MARKER = 'only'

/** `http://localhost:63315/@fs/abs/path?v=1`, `file:///abs/path`: how a browser run may spell a file. */
export const BROWSER_PATH_PREFIX_PATTERN = /^(?:https?:\/\/[^/]+(?:\/@fs)?|file:\/\/)/

export const QUERY_SUFFIX_PATTERN = /[?#].*$/

/** Generated files: regenerated, never written by hand. */
export const GENERATED_FILE_PATTERN = /\.generated\./

/** Separator of the describe titles and the test title in a case's full name, as vitest prints it. */
export const CASE_NAME_SEPARATOR = ' > '

/** Separates a test file from a case name on the command line: `src/add.test.ts::add > one plus two`. */
export const CASE_ARGUMENT_SEPARATOR = '::'

/**
 * The curly quotes a lot declaration entry and a test title compare as their straight counterparts: an entry
 * typed with `'` names a title written with `’`, and the reverse. Nothing else folds (no backtick, prime or case).
 */
export const FOLDED_QUOTES: ReadonlyMap<string, string> = new Map([
	['\u{2018}', "'"],
	['\u{2019}', "'"],
	['\u{201C}', '"'],
	['\u{201D}', '"'],
])

/** The curly quotes `FOLDED_QUOTES` folds, as one pattern. */
export const CURLY_QUOTE_PATTERN = /[\u{2018}\u{2019}\u{201C}\u{201D}]/gu

/** After an `unused accept` line's entry: the closest case title of the change, `{label}`. */
export const UNUSED_ACCEPT_CLOSEST = '; the closest: {label}'

/** How many closest titles an `unused accept` line names. */
export const UNUSED_ACCEPT_CLOSEST_LIMIT = 1

/** A lot exempt from the test receipts: `"tdd": "exempt: <reason>"`. */
export const TDD_EXEMPT_PATTERN = /^exempt:\s*(.+)$/

/** The environment variable naming the file the reporter writes the run to. */
export const REPORT_ENVIRONMENT_VARIABLE = 'DIALECTE_TDD_REPORT'

/** The reporter module, next to the cli's entry (built) or next to this file (sources). */
export const REPORTER_FILE_NAMES = ['tdd-reporter.js', 'tdd-reporter.ts'] as const

/** A test name pattern no case matches: the run collects the cases and runs none. */
export const COLLECT_ONLY_PATTERN = '^$'

/** How many lines of an error's message a receipt and a report keep. */
export const MESSAGE_LINES = 6

export const PROVES_NOTHING = 'it ran green: this test proves nothing yet'

export const FROZEN_AFTER_RED = 'tests are frozen after red; go back to the test station'

/** The fallback when no package binary is found: the package's own vitest through npx, never a download. */
export const VITEST_COMMAND = ['npx', '--no-install', 'vitest', 'run'] as const

/** Where a package manager links a dependency's binary, relative to a folder holding `node_modules`. */
export const VITEST_BIN_PATH = ['node_modules', '.bin', 'vitest'] as const

/** The argument that makes the vitest binary run once instead of watching. */
export const VITEST_RUN_ARGUMENT = 'run'

/** A folder holding this entry (a folder, or a file in a worktree) is the repository root. */
export const REPOSITORY_MARKER = '.git'

/** How many last lines of a run that wrote no report are shown. */
export const RUN_OUTPUT_TAIL_LINES = 20

/** What separates the killed processes in the one line of a stalled run's failure. */
export const REPORT_LINE_SEPARATOR = ' / '

export const NO_RED_RECEIPT = 'no red receipt: the test station runs tdd red first'

export const TDD_SUBCOMMANDS = ['red', 'green', 'status'] as const

/** The gate step that checks the receipts, after the hygiene. */
export const TDD_STEP = { name: 'tdd', run: '' } as const

export const VITEST_PACKAGE = 'vitest'

export const TDD_NEXT_STEPS =
	'the test station runs `dialecte tdd red`, the implement station `dialecte tdd green`'

/** The ledger's format: a ledger of another format is refused, never read wrongly. */
export const LEDGER_VERSION = 3

export const NOTHING_CHANGED_SINCE_RED = 'nothing in production changed since red'

export const CHANGED_AND_PASSES =
	'its test changed since its receipt and it passes: this test proves nothing yet'

export const ONLY_REFUSAL =
	'remove the focus markers first (.only, only: true), line {lines}: vitest skips the other cases'

export const TEST_CODE_CHANGED_SINCE_RED = 'test code changed since its red and it passes'

/**
 * Why the read rule skips a receipt: its lot file entry is gone, or a red then a green of its case hash
 * precede it. `SkippedReceiptReason` is derived from it.
 */
export const SKIPPED_RECEIPT_REASONS = {
	undeclared: 'no longer declared',
	proven: 'proven red → green before it',
} as const

/** What a red run adds to a proven case's line when an `accept` entry still names it: no receipt is recorded. */
export const ACCEPTANCE_NOT_NEEDED =
	'acceptance not needed (proven red → green): it can be removed from the lot file'

/**
 * What a red run adds to a proven, unchanged case's line when a `revised` entry covers it: no receipt is
 * recorded; `{reason}` the entry's reason.
 */
export const REVISION_NOT_NEEDED = 'revision not needed (nothing changed since its proof): {reason}'

/** The label of the grouped line of the cases moved exactly from one source file. */
export const MOVED_LABEL = 'moved'

/** The label of the grouped line of the cases a runner registers, moved by name from one source file. */
export const MOVED_BY_NAME_LABEL = 'moved by name'

/** The end of a moved line when a target's code around its test calls differs from the source's. */
export const MOVED_SURROUNDINGS_CHANGED = ' · test code changed around them'

/** The end of a moved by name line: the runner calls at the base and now. */
export const MOVED_RUNNER_CHANGED = ' · runner changed: {from} → {to}'

/** A case several files hold now (or held at the base) under one name and project: moved from none. */
export const AMBIGUOUS_MOVE_LINE = 'ambiguous  {case}  in {files}: moved from none of them'

/** The collect-only run of the base sources the by-name match needed, and how long it took. */
export const BASE_COLLECT_LINE = 'base collect  {files} file(s)  {duration}'

/** Added to the base collect line when the run failed: nothing moved by name. */
export const BASE_COLLECT_FAILED_LINE = 'failed, nothing moved by name: {failure}'

/**
 * The bound of the collect-only run of the base sources: a guard against a hang. Collecting a few files
 * takes seconds even on a loaded machine; five minutes is far above it.
 */
export const BASE_COLLECT_TIMEOUT_MS = 300_000

/** The label of a `tdd status` or gate line naming the receipts of a case the read rule skips. */
export const SKIPPED_RECEIPTS_LABEL = 'skipped'

/** What `"accept"` or `"revised"` of the lot file must hold, `{list}` the list's name. */
export const CASE_LIST_SHAPE =
	'each "{list}" entry must be { "case": "<file>::<name>", "reason": "<why>" }'

/** The extensions a relative import may leave out. */
export const MODULE_EXTENSIONS: readonly string[] = ['.ts', '.tsx', '.mts', '.js', '.mjs', '.json']

/** The tsconfig files of a package root that may map `paths`. */
export const TSCONFIG_FILE_PATTERN = /^tsconfig(\..+)?\.json$/

/**
 * A Vite import query or fragment after a specifier's file (`?worker&url`, `?raw`, `#part`): never at its first
 * character, where `#` starts a subpath import (`#internal/x`).
 */
export const SPECIFIER_QUERY_PATTERN = /(?<=.)[?#].*$/

/** `import.meta.<name>(...)`: Vite's glob import, whose patterns name the files a test reads. */
export const META_GLOB_NAME = 'glob'

/** Before a pattern of `import.meta.glob` that leaves the files it matches out. */
export const NEGATED_GLOB_PREFIX = '!'

/** A specifier that names a file of the package, not a dependency: `#imports`, `~/`, `@/`. */
export const LOCAL_SPECIFIER_PATTERN = /^(#|~\/|@\/)/

export const UNRESOLVED_IMPORT_HINT = 'map it in a tsconfig "paths" or a vite resolve.alias'

/** Why a red run leaves a helper a `revised` entry names unfrozen: a changed dependent of it is not in the run. */
export const HELPER_DEPENDENT_OUTSIDE_RUN =
	'a changed test file outside this run depends on it: {files}'

/** The keys a lot file may hold; any other is a typo, refused. */
export const LOT_KEYS: readonly string[] = ['tdd', 'accept', 'revised', 'gone', 'mutation']

/** The keys of an `accept` or `revised` entry. */
export const CASE_ENTRY_KEYS: readonly string[] = ['case', 'reason']

/** The receipts that prove a case before its code: a red, or a pass needing no red. */
export const PROOF_KINDS: readonly string[] = ['red', 'unchanged', 'accepted', 'revised']

/** Test code under a declared production folder: fixtures and snapshots by their folder. */
export const FIXTURE_FOLDER_PATTERN = /(^|\/)(__fixtures__|fixtures|__snapshots__)\//

/** A script beside the code (`tool.script.ts`): test code, also under a declared production folder. */
export const SCRIPT_FILE_PATTERN = /\.script\.[cm]?[jt]sx?$/

/** Source compared by its tokens (format-insensitive); any other file by its bytes. */
export const SOURCE_FILE_PATTERN = /\.[cm]?[jt]sx?$/

/** Closing brackets: a comma right before one is a trailing comma, formatting only. */
export const CLOSING_TOKENS: readonly string[] = [')', ']', '}', '>']

/** Before a comma, these mean no element came first (`[,]`, `[1,,]`): the comma is a hole, kept. */
export const OPENING_ELEMENT_TOKENS: readonly string[] = ['[', ',', '(', '{', '<']

/** A comment in trivia: a block or a line comment. */
export const COMMENT_PATTERN = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g

/** The token of an array hole (`[,]`): it has no text of its own. */
export const HOLE_TOKEN = '<hole>'

/** Comments a tool reads, compared like code: a test environment, a bundler hint. */
export const TOOL_COMMENT_PATTERN = /@(vitest|jest)-environment|@vite-ignore/

/** What `dialecte lot` writes. */
export const LOT_VERBS: readonly string[] = ['exempt', 'accept', 'revised', 'gone', 'mutation']

/** The keys of a `gone` entry. */
export const GONE_ENTRY_KEYS: readonly string[] = ['file', 'reason']

/** What `"gone"` of the lot file must hold. */
export const GONE_LIST_SHAPE =
	'each "gone" entry must be { "file": "<file or glob>", "reason": "<why>" }'

/** Characters a regular expression reads as syntax: a glob's literal characters, escaped. */
export const GLOB_SPECIAL_CHARACTER_PATTERN = /[.+^${}()|[\]\\]/g

/** A test call of the base gone without a title: the finding a `gone` entry of the lot file covers. */
export const UNTITLED_CALL_GONE = 'a test call of the base is gone'

/** A passing case a `revised` entry names that the base cannot be shown to hold. */
export const NOT_PROVABLY_OF_THE_BASE = 'not provably a case of the base: accept it or prove it red'

/** What a production state records for a file of the base the change deletes. */
export const DELETED_PRODUCTION_FILE = 'deleted'

/**
 * The line `tdd red` and `tdd green` print before their summary when production moved back to an earlier
 * content, `{files}` the files moved back.
 */
export const ROLLBACK_LINE =
	"rollback: production moved back to an earlier content: {files} - a red or a green at code put back proves nothing about the order the code and its test came in; run a fix's test on the previous round's snapshot (dialecte lot delta --worktree)"

/** The vitest option naming the files run before every test file: a dependency of each test file for tdd. */
export const SETUP_FILES_PROPERTY = 'setupFiles'

/** Config files a test project is declared in: where a test file's import aliases come from. */
export const TEST_CONFIG_FILES = [
	'vitest.config.ts',
	'vitest.config.mts',
	'vitest.config.js',
	'vitest.config.mjs',
	'vitest.workspace.ts',
	'vite.config.ts',
	'vite.config.mts',
	'vite.config.js',
	'vite.config.mjs',
] as const

/** The refusal reason of a case whose id another case of the run shares: `{count}`, `{lines}` and `{hint}` filled in. */
export const DUPLICATE_ID_REASON = '{count} cases share this id (lines {lines}): {hint}'

/** The hint of a duplicate whose title is a table's format (an `.each` / `.for` call): vitest cuts a `$` field. */
export const DUPLICATE_HINT_TABLE =
	"spell each title in full (a `$` field of an each-title is cut by vitest's truncateThreshold, or set it to 0)"

/** The hint of a duplicate whose title is a plain one. */
export const DUPLICATE_HINT_RENAME = 'rename one'

/** What a case without a location prints in the lines of a duplicate. */
export const UNKNOWN_LINE = '?'

/** The label of the line of a duplicate a run does not judge. */
export const DUPLICATE_LABEL = 'duplicate'

/** The detail of a group's line (the gate's tdd step, the hand-over card): `{lines}` its members' lines. */
export const DUPLICATE_LINES_DETAIL = 'lines {lines}'

/** The label of a group's line on the hand-over card, after its failed mark. */
export const DUPLICATE_CARD_LABEL = 'duplicate id'

/** The gate's tdd step reason when duplicate ids exist: `{count}` files, `{files}` their paths. */
export const DUPLICATE_GATE_REASON = 'duplicate case ids in {count} file(s): {files}'
