import type { FailureKind } from './tdd.types.ts'

/** The receipts of a worktree, in its git folder: never in the tree, never committed. */
export const TDD_LEDGER_FILE = 'dialecte-tdd.json'

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

/** The package's own vitest, never a download. */
export const VITEST_COMMAND = ['npx', '--no-install', 'vitest', 'run'] as const

/** How many last lines of a run that wrote no report are shown. */
export const RUN_OUTPUT_TAIL_LINES = 20

export const NO_RED_RECEIPT = 'no red receipt: the test station runs tdd red first'

export const TDD_SUBCOMMANDS = ['red', 'green', 'status'] as const

/** The gate step that checks the receipts, after the hygiene. */
export const TDD_STEP = { name: 'tdd', run: '' } as const

export const VITEST_PACKAGE = 'vitest'

export const TDD_NEXT_STEPS =
	'the test station runs `dialecte tdd red`, the implement station `dialecte tdd green`'

/** The ledger's format: a ledger of another format is refused, never read wrongly. */
export const LEDGER_VERSION = 2

export const NOTHING_CHANGED_SINCE_RED = 'nothing in production changed since red'

export const CHANGED_AND_PASSES =
	'its test changed since its receipt and it passes: this test proves nothing yet'

export const NOT_RECORDED = '(not recorded: the file has a refusal)'

export const ONLY_REFUSAL =
	'remove the focus markers first (.only, only: true), line {lines}: vitest skips the other cases'

export const TEST_CODE_CHANGED_SINCE_RED = 'test code changed since its red and it passes'

/** What `"accept"` of the lot file must hold. */
export const ACCEPT_SHAPE =
	'each "accept" entry must be { "case": "<file>::<name>", "reason": "<why>" }'

/** The extensions a relative import may leave out. */
export const MODULE_EXTENSIONS: readonly string[] = ['.ts', '.tsx', '.mts', '.js', '.mjs', '.json']

/** The tsconfig files of a package root that may map `paths`. */
export const TSCONFIG_FILE_PATTERN = /^tsconfig(\..+)?\.json$/

/** A specifier that names a file of the package, not a dependency: `#imports`, `~/`, `@/`. */
export const LOCAL_SPECIFIER_PATTERN = /^(#|~\/|@\/)/

export const UNRESOLVED_IMPORT_HINT = 'map it in a tsconfig "paths" or a vite resolve.alias'

/** The keys a lot file may hold; any other is a typo, refused. */
export const LOT_KEYS: readonly string[] = ['tdd', 'accept']

/** The keys of an `accept` entry. */
export const ACCEPT_ENTRY_KEYS: readonly string[] = ['case', 'reason']
