import type { PackageJson } from '../package-json.types.ts'
import type { Clock } from '../progress/clock.types.ts'
import type { Watchdog } from '../progress/run-child.types.ts'
import type { StepProgress } from '../progress/step-progress.types.ts'
import type { RUNNER_ORDER, SKIPPED_RECEIPT_REASONS, TDD_SUBCOMMANDS } from './tdd.constants.ts'
import type { TestCodePath, TestCodePresence } from './test-code-presence.types.ts'

/**
 * A test case: its file, relative to the package root, its full name as vitest prints it
 * (`describe > it`), and the vitest project that runs it (empty without projects). A case run by two
 * projects is two cases: each must earn its own receipts.
 */
export type TestCaseId = { file: string; name: string; project: string }

/** A test case with the hash of its own test call. */
export type HashedTestCase = TestCaseId & { caseHash: string }

/** Where a test case or an error frame is in its file, 1-based. */
export type SourceLocation = { line: number; column: number }

/** One frame of an error's stack, as the test runner parsed it. */
export type ErrorFrame = SourceLocation & { file: string }

/**
 * An error as the test runner reported it. `inAssertion` is the pytest plugin's own answer: the innermost frame in
 * the test file lies inside an `assert` statement (undefined for the runners whose test source the cli reads).
 */
export type ReportedError = {
	name?: string
	/** The error's own code when it has one (node's `ENOENT`, `ERR_MODULE_NOT_FOUND`; Python's errno name). */
	code?: string
	message: string
	frames: ErrorFrame[]
	inAssertion?: boolean
}

/**
 * What the pytest plugin reports of a case's source: the test function's own text without its parametrize
 * decorators, and, for a parametrized case, the text of its parameter row (the rows of stacked decorators joined).
 */
/**
 * A pytest case's source as the cli's plugin reads it: its function with its decorators but its parametrize ones
 * (`call`), its row of each parametrize call (`row`), and each parametrize call but its literal values (`parametrize`).
 */
export type PythonCaseSource = {
	call: string
	row?: string
	parametrize?: string
	/** The same function's parametrize settings in the base text, when the run was given it and the base defines it. */
	baseParametrize?: string
}

/**
 * A pytest case's `call` split at its `def` line: the name it defines, each decorator above that line alone
 * (whitespace normalised), and the function's text from `def` on.
 */
export type PythonCallParts = { functionName: string; decorators: string[]; body: string }

/** The interpreter of a pytest folder: a command and the arguments before `-m pytest`. */
export type PackagePython = {
	command: string
	arguments: readonly string[]
}

/** What a pytest configuration says of test discovery, pytest's defaults for what it does not declare. */
export type PytestConfig = {
	/** `python_files`: the patterns a test module matches (by its name, or by its path when a pattern holds `/`). */
	pythonFiles: string[]
	/** `testpaths`: where discovery starts, relative to the configuration's folder (globs); none: the folder itself. */
	testpaths: string[]
	/** `norecursedirs`: the patterns of the folders discovery never enters below where it starts. */
	norecursedirs: string[]
}

/** A pytest folder (absolute) with the configuration it holds: pytest's defaults when it holds none. */
export type PytestFolder = { folder: string; config: PytestConfig }

/** A pytest setting as written: a string (split as a shell splits a line) or a list (a TOML array). */
export type PytestSetting = string | string[]

/** The sections of an ini file (`[name]`), each with its keys and their values as written. */
export type IniSections = Map<string, Map<string, string>>

/** The values of a TOML document by their dotted key paths (`tool.pytest.ini_options.testpaths`), and its tables. */
export type TomlDocument = { values: Map<string, TomlValue>; tables: Set<string> }

/** Where the TOML reader stands in a text. */
export type TomlCursor = { text: string; index: number }

/** A value the TOML reader read, with the index just after it. */
export type TomlRead<T> = { value: T; end: number }

/** A TOML value as the pytest reader keeps it: a string, a list, or another value it does not read. */
export type TomlValue = string | TomlValue[] | { unread: string }

export type ReportedCaseState = 'passed' | 'failed' | 'skipped' | 'pending'

/** The runners a test file can run under, chosen per file. */
export type TestRunner = (typeof RUNNER_ORDER)[number]

/** The test files of one runner, in the order the change lists them. */
export type RunnerGroup = { runner: TestRunner; files: string[] }

/**
 * What the dispatcher tells its caller about each runner's run: `start` before the runner runs its files, and the
 * `finish` it answers once the runner has answered (`failed`: it answered a failure, the later runners are not started).
 */
export type RunnerObserver = {
	start(params: { runner: TestRunner; fileCount: number }): {
		finish(params: { failed: boolean }): void
	}
}

/** The test files split by runner, and the files of no runner (they leave the selection). */
export type RunnerGroups = { groups: RunnerGroup[]; outside: string[] }

/** What a runner is asked: the test files, which cases of them to run, and the bounds of the run. */
export type RunnerParams = {
	root: string
	/** Test files, relative to the root. */
	files: readonly string[]
	/** The full names of the cases to run, every case of the files, or none (collect them only). */
	filter: { names: readonly string[] } | 'all' | 'collect'
	/** Default: the system clock. */
	clock?: Clock
	/** Default: stalled after 10 min, sampled every 5 s, with the machine's tools. */
	watchdog?: Watchdog
	/** A hard bound in milliseconds: the run's process group is killed past it, the run answers a failure. */
	timeoutMs?: number
	/**
	 * `root` is a copy of this package (a base run): pytest runs with this package's own interpreter, the copy's
	 * folder first on the import path, and is refused when the package is installed editable there. Default: none.
	 */
	interpreterRoot?: string
	/** The base texts of test files (relative to the root): pytest reports their own code too. Default: none. */
	baseTexts?: Readonly<Record<string, string>>
	/** pytest reports each test file's own code (a red run: what a moved case may keep). Default: not. */
	ownCode?: boolean
	/**
	 * The vitest projects of the command (`readVitestSelection`): with CI's names, the files a selected project holds
	 * run with a `--project` per name, the others in a second run without; a selection that could not be read is
	 * the vitest run's failure. Default: one run, every project.
	 */
	vitestSelection?: VitestSelectionReader
}

/**
 * One run of a runner's process through the cli's reporter: the command and its arguments, the environment it adds
 * (the report's path is added to it) and the variables it removes, and the run asked.
 */
export type ReportingRun = {
	runner: TestRunner
	command: string
	args: string[]
	environment: Record<string, string>
	unset?: string[]
	/** The folder the process runs in. Default: the run's root. */
	cwd?: string
	/** JSON inputs written in the run's temporary folder, each file's path given to the process in its variable. */
	inputs?: Readonly<Record<string, unknown>>
	run: RunnerParams
}

/** A runner: its files in, what its run saw (or why it could not run) out. */
export type RunnerFunction = (params: RunnerParams) => Promise<ReportedModule[] | TestRunFailure>

/** One test case as the run saw it. */
export type ReportedCase = {
	/** The full name: the describe titles and the test's own, joined with ` > `. */
	name: string
	state: ReportedCaseState
	/** The vitest project that ran it (empty without projects). */
	project: string
	location?: SourceLocation
	errors: ReportedError[]
	/** pytest: the case's source, as the plugin read it. */
	source?: PythonCaseSource
	/** pytest, in a collect: a skip or a skipif that is true marks the case. */
	skipMarked?: boolean
}

/** One test file as the run saw it: an error at collection (a syntax error, a throw at import) and its cases. */
export type ReportedModule = {
	/** Absolute path. */
	file: string
	/** The runner that ran the file. */
	runner: TestRunner
	errors: ReportedError[]
	cases: ReportedCase[]
	/** pytest: the files of test code (absolute paths) the file used: conftests, helpers, data it opened. */
	dependencies?: string[]
	/** pytest: the file's own code (`own-code.ts` for JS/TS), read by the cli's plugin. */
	ownCode?: OwnCodeStatement[]
	/** pytest: the own code of the file's base text, when the run was given it (`RunnerParams.baseTexts`). */
	baseOwnCode?: OwnCodeStatement[]
}

/**
 * Why a case failed. `assertion`, `not-implemented` thrown from inside an asserting `expect(...)`, and
 * `error-in-production` (a TypeError existing code throws inside an asserting `expect(...)`: a bug the test
 * pins) are a red; the others fail before the behaviour is asserted.
 */
export type FailureKind =
	| 'assertion'
	| 'not-implemented'
	| 'error-in-production'
	| 'not-implemented-outside-assertion'
	| 'not-implemented-at-import'
	| 'missing-export'
	| 'type-error'
	| 'syntax-error'
	| 'timeout'
	| 'error'

/**
 * Why a case failed, and its message. `missingInput`: the error thrown is a missing file or path, told by its code
 * or name (`isMissingInputError`), never by its message's words; present only when true.
 */
export type CaseFailure = { kind: FailureKind; message: string; missingInput?: true }

/** What a red, green or refusal says about the evidence, for the reviewer. */
export type ReceiptFlag =
	/**
	 * Code rolled back: a red at a production state an earlier, superseded receipt of the case already had, or
	 * a red or a green taken while a production file is back at an earlier content.
	 */
	| 'rollback'
	/** A red of a case whose own last receipt is a green, production unchanged since: its test was made red again. */
	| 'red after green'
	/** A green case kept at a red run that froze test code it depends on at a new state. */
	| 'test code changed around it'
	/** A red a revised case earned on the base's production, with the lot's current test code over it. */
	| 'red on base'
	/** A red carried from the case's earlier label by a `moved` entry, its test call the one that red froze. */
	| 'moved'
	/** A red carried from the same case of the lot this one was rebuilt from (`lot start --from`), its test code and production slice the ones that red ran on. */
	| 'carried'

/**
 * - `red`: the case failed for a real reason before the code;
 * - `unchanged`: it passed at a red run and is the same case as at the base (no proof needed);
 * - `green`: it passed after its red, its test untouched;
 * - `accepted`: it passed at a red run and the lot accepts it (`.dialecte/lot.json`), with a reason;
 * - `kept`: a green case that passed at a red run which froze test code it depends on at a new state;
 * - `revised`: a proven case edited at review, passing at a red run, the lot declaring the revision with
 *   a reason (`.dialecte/lot.json` `"revised"`);
 * - `refused`: a red or a green the cli refused, kept as evidence.
 */
export type ReceiptKind =
	| 'red'
	| 'green'
	| 'unchanged'
	| 'accepted'
	| 'kept'
	| 'revised'
	| 'refused'

/** The proof of what a case did at a given state of its test and of the production files. */
export type TddReceipt = TestCaseId & {
	kind: ReceiptKind
	/** sha256 of the test file. */
	testFileHash: string
	/** sha256 of the case's own name and test call: a case edited since is another case. */
	caseHash: string
	/** sha256 over every production file (not test code, not generated): path and content. */
	productionHash: string
	/** A red: the failing assertion's message. */
	message?: string
	/** A refusal: why. */
	reason?: string
	flags?: ReceiptFlag[]
	/** A carried red: the lot it was carried from and the time of the source's red. */
	carriedFrom?: { lot: string; at: string }
	/** ISO date. */
	at: string
}

/** Why a receipt of a case does not count: its declaration left the lot file, or a proof already stands before it. */
export type SkippedReceiptReason =
	(typeof SKIPPED_RECEIPT_REASONS)[keyof typeof SKIPPED_RECEIPT_REASONS]

/**
 * The receipts of a case split by the read rule: those that count (oldest first) and those skipped, each with
 * why. Nothing of the ledger is rewritten: the skip is only how the receipts are read.
 */
export type CountingReceipts = {
	counting: TddReceipt[]
	skipped: SkippedReceipt[]
}

/** A receipt the read rule skips, with why. */
export type SkippedReceipt = { receipt: TddReceipt; reason: SkippedReceiptReason }

/** The test code a red run froze: each file (test files, helpers, fixtures, snapshots) with its sha256. */
export type TddFreeze = {
	kind: 'freeze'
	files: Record<string, string>
	/** The helpers (test code that is not a test file) this run froze because a `revised` entry of the lot file names them. */
	revised?: string[]
	/** The conftests each frozen pytest file ran under (relative to the root, sorted): a moved case keeps them. */
	conftests?: Record<string, string[]>
	/** The token hashes of each frozen JS/TS test file's own code (`own-code.ts`): what a moved case may keep of it. */
	ownCode?: Record<string, string[]>
	at: string
}

export type TddEntry = TddReceipt | TddFreeze

/**
 * Everything a worktree's `tdd` commands recorded, oldest first: the order decides what "later" means.
 * `production`: per base (the commit a run measured the change from), per production state a receipt
 * names (its `productionHash`), the content hash of each production file that differs from that base
 * (`'deleted'` for a file of the base deleted); a file absent from a state is as at that base. Keyed by
 * base first, a state means nothing against another base, and the same tree read at two bases keeps
 * both. A ledger without it records no state.
 */
export type TddLedger = {
	version: 3
	entries: TddEntry[]
	production?: Record<string, Record<string, Record<string, string>>>
}

/** Why a ledger text is no ledger of this cli: not JSON, or another version (or no entry list). */
export type LedgerUnreadable = 'json' | 'version'

/**
 * The production files of the package now: `hash` as `hashProduction` computes it, `base` the commit
 * the change is measured from, `files` the production files changed since that base with the sha256 of
 * their bytes (`'deleted'` for a file of the base deleted).
 */
export type ProductionState = { hash: string; base: string; files: Record<string, string> }

export type CaseStatus =
	| 'red'
	| 'green'
	| 'unchanged'
	| 'accepted'
	| 'revised'
	| 'missing receipt'
	| 'test edited after red'

export type CaseStatusLine = TestCaseId & {
	status: CaseStatus
	flags: ReceiptFlag[]
	/** The receipts of the case the read rule skips (`countingReceipts`); absent when none is. */
	skipped?: SkippedReceipt[]
	/** The hash of the case's test file now, as tdd records it in a receipt (`hashTestCodeText`); `readTddState` sets it. */
	testFileHash?: string
	/** Its test file is moved with its bytes (R100): its case is the base's; absent otherwise. */
	movedFile?: true
	/** It is skipped as written (`isRunCaseSkippedAsWritten`): no run judges it; absent otherwise. */
	skippedAsWritten?: true
}

/**
 * A test file of the change: its text now, and at the base (undefined when the file is new); `baseFile` its path at
 * the base when git reports it renamed (its base text read there).
 */
export type ChangedTestFile = {
	file: string
	text: string
	baseText: string | undefined
	baseFile?: string
}

/** The tdd state of a lot, as `.dialecte/lot.json` declares it. */
export type LotDeclaration = {
	tdd?: string
	accept?: unknown
	revised?: unknown
	gone?: unknown
	moved?: unknown
	/** Whether and how `dialecte mutants run` mutates the lot: `off`, `changed`, `audit` or `gate`. */
	mutation?: unknown
}

/**
 * A case the lot file names with a reason: accepted without a red, or revised at review.
 * `<file>::<name>` (` [project]` when a project runs it).
 */
export type LotCaseEntry = { case: string; reason: string }

/**
 * A case of the lot moved after its red (a split, a rename): two cases (`<file>::<name>`, ` [project]` optional), or a
 * file and a file or glob its cases moved to under the same names.
 */
export type LotMovedEntry = { from: string; to: string; reason: string }

/** A case a `moved` entry carries receipts from, with that entry. */
export type MovedFrom = { entry: LotMovedEntry; from: TestCaseId }

/** One statement of a test file's own code: its text and the hash of its tokens. */
export type OwnCodeStatement = { text: string; hash: string }

/** A moved case's file against its earlier file's own code at a red: kept within it, one statement added, or nothing recorded. */
export type OwnCodeVerdict =
	| { kind: 'kept' }
	| { kind: 'added'; statement: string }
	| { kind: 'conftests'; files: string[] }
	| { kind: 'unrecorded' }

/**
 * What a red run makes of a passing case `moved` entries name, before its run on the base: the red it may carry (from
 * its earlier case), or why none can be carried.
 */
export type MovedCarry =
	| { kind: 'carry'; from: TestCaseId; red: TddReceipt; lot?: string }
	| { kind: 'refused'; reason: string }

/** A test helper (test code that is not a test file) a red run froze at its current hash because a `revised` entry names it. */
export type RevisedHelper = { file: string; entry: LotCaseEntry }

/**
 * A test file (or a glob over test files) whose test calls of the base, gone without a title, the lot
 * declares with a reason: `"gone": [{ "file": "<file or glob>", "reason": "..." }]`.
 */
export type LotGoneEntry = { file: string; reason: string }

/** The lists of cases a lot file may hold. */
export type LotCaseList = 'accept' | 'revised'

/** What the command line names: cases (`<file>::<name>`) and files. */
export type TddTargets = { cases: Array<{ file: string; name: string }>; files: string[] }

/** A changed test file whose cases cannot be listed: it fails while loading. */
export type UnlistedFile = { file: string; failure: CaseFailure }

export type TddSubcommand = (typeof TDD_SUBCOMMANDS)[number]

/** The gate's `tdd` step: passed with a note, skipped or failed with a reason, and the lines that show why. */
/**
 * A case the gate's tdd step judged: its label (`file::name [project]`) and its status there; the step's own judgement
 * adds its id and what the hook reads of it (absent from records written before them).
 */
export type JudgedCase = Partial<
	TestCaseId & Pick<CaseStatusLine, 'testFileHash' | 'movedFile' | 'skippedAsWritten'>
> & {
	label: string
	status: CaseStatus
}

/** A vitest run that answered no report: the cli's reason (one line), and the last lines vitest printed, to relay. */
export type TestRunFailure = {
	failure: string
	tail?: readonly string[]
}

/** The commit the change is measured from, and where it came from. */
export type TddBase = {
	/** A full sha. */
	commit: string
	/**
	 * Which base it is: the lot base read from git (`lot`), HEAD when no base branch is found and none is configured
	 * (`head`), the merge-base of a `--base <ref>` (`flag`), the gate's own lot base (`gate`).
	 */
	kind: 'lot' | 'head' | 'flag' | 'gate'
	/** One of the `TDD_BASE_SOURCES` texts, its `{ref}` filled. */
	source: string
}

export type TddCheck = {
	status: 'passed' | 'failed' | 'skipped'
	/** `tdd base: <short sha> (<source>)`, the base the step measured from (the whole-branch form only). */
	baseNote?: string
	/**
	 * The cases of the change the step judged; empty when it judged none (exempt, no test code changed);
	 * absent when it stopped before listing them or skipped.
	 */
	cases?: JudgedCase[]
	note?: string
	reason?: string
	lines?: string[]
	/** Evidence shown under a passed step: flags, deleted cases. */
	details?: string[]
	/** The grouped lines of the cases moved from the base (`moved`, `moved by name`): the card shows them. */
	moved?: string[]
	/** The case ids more than one case holds: the gate record keeps them for the card. */
	duplicates?: DuplicateCaseId[]
}

export type TddExemption =
	| { kind: 'none' }
	| { kind: 'exempt'; reason: string }
	| { kind: 'invalid'; reason: string }

/** What every `tdd` subcommand reads: the package, the command line, the clock of the receipts. */
export type TddContext = {
	root: string
	packageJson: PackageJson
	json: boolean
	/** `status --flags`: only the cases whose receipts carry a flag. */
	flagsOnly: boolean
	now: () => Date
	targets: TddTargets
	ledger: TddLedger
	base: string
	/** The presence map of the change since the base: every reader of the run takes test code from it. */
	presence: TestCodePresence
	/** Where a vitest run announces itself (a start line or a spinner); none when not given. */
	progress?: StepProgress
	/**
	 * The vitest projects of a red or green run (`readCommandSelection`), read once: every run of it passes them; why
	 * they could not be read, answered by its vitest run.
	 */
	vitestSelection?: VitestSelectionReader
}

/** What a `red` or `green` run read before it runs: nothing refused it, its step is recorded from here. */
export type TddRunAdmission = {
	/** Every test-code file changed since the base, with its hash. */
	testCode: Map<string, string>
	/** Every changed test file. */
	changed: ChangedTestFile[]
	/** The changed test files the command line points at (a green's: the moved ones too). */
	files: ChangedTestFile[]
	/** The test files moved with their bytes (R100) a green runs; none for a red. */
	moved: ChangedTestFile[]
	acceptances: LotCaseEntry[]
	revisions: LotCaseEntry[]
	moves: LotMovedEntry[]
	/** The package's vitest configs, read once for the run: why a file ran no case. */
	configs: VitestConfigs
}

/** An error as vitest hands it to a reporter: its message, name and parsed stack. */
export type RunnerError = {
	name?: string
	/** The serialized error's own `code` property, whatever its type. */
	code?: unknown
	message?: string
	stacks?: readonly { file: string; line: number; column: number }[]
}

/**
 * A test call of a file: its title as written (undefined when computed), its source, whether it is an
 * `.each` / `.for` call (its title a format), and the titles of the `describe` / `suite` calls around it,
 * outermost first (undefined for a computed one: a variable, a template with substitutions, an `.each` /
 * `.for` format).
 */
export type TestCall = {
	title: string | undefined
	text: string
	each: boolean
	describePath: (string | undefined)[]
}

/**
 * What the review should see beside the case statuses: test cases gone since the base, a file left out.
 * `gone`: a test call of the base gone without a title, in a file a `gone` entry of the lot file names
 * (its reason in the detail); `deleted`: any other.
 */
export type TddFinding = { verb: 'deleted' | 'gone'; file: string; detail: string }

/**
 * The state of the change's test code and cases, as `tdd status` and the gate read it: each case, the test
 * code changed since the last red run that froze it, the deleted cases, the files that cannot be listed.
 */
export type TddState = {
	cases: CaseStatusLine[]
	/** The case ids more than one case of the change's files holds. */
	duplicates: DuplicateCaseId[]
	unfrozen: string[]
	findings: TddFinding[]
	unlisted: UnlistedFile[]
	/** The changed test files whose run reports no case, with why (`ZERO_CASE_REASONS`); absent when none. */
	zeroCases?: ZeroCaseRefusal[]
	/** The changed test files no vitest config includes: out of the selection; absent when none. */
	notVitest?: string[]
	/** The changed pytest files a conftest leaves out of discovery: out of the selection; absent when none. */
	pytestIgnored?: string[]
	/** What the cases of the change moved from; absent when nothing moved and no base collect ran. */
	moves?: TddMoves
}

/** One case id that more than one case of a run holds: `lines` is each member's line, in run order (undefined without a location). */
export type DuplicateCaseId = {
	file: string
	project: string
	name: string
	lines: (number | undefined)[]
}

/** A case as a run of its file saw it, with what `tdd` needs to judge it. */
export type RunCase = TestCaseId & {
	state: ReportedCaseState
	failure?: CaseFailure
	/** sha256 of the case's name and its test call now: `${name}\0${body}`. */
	caseHash: string
	/** What the case hash covers besides the name: its test call's tokens (a pytest case's call and row). */
	body: string
	/** New or changed since the base, by its test call and titles. */
	ofChange: boolean
	/** The base provably holds it (its file, its own title and every title written now), whatever its call. */
	ofBase: boolean
	/** Where the run located it in its file (its test call, or the runner call a helper registers it through). */
	location?: SourceLocation
}

/** What a red run makes of one case: the kind it records (a kept without flags records none) and its line. */
export type RedJudgement = {
	testCase: RunCase
	kind: 'red' | 'unchanged' | 'accepted' | 'kept' | 'revised' | 'refused'
	detail: string
	message?: string
	reason?: string
	flags: ReceiptFlag[]
	/** The production state the receipt names when it is not the tree's now: a red on base, the base's. */
	productionHash?: string
	/** A red carried from the lot this one was rebuilt from: that lot and the time of its red (the receipt's `carriedFrom`). */
	carriedFrom?: { lot: string; at: string }
}

/** Where an import of a test file leads. */
/** What the module resolver asks of the files: whether an absolute path is a file. Default: the disk. */
export type ModuleResolverHost = { isFile(path: string): boolean }

export type ModuleResolution =
	| { kind: 'local'; file: string }
	| { kind: 'package' }
	| { kind: 'unresolved' }

/**
 * Resolves a specifier imported by a file (both relative to the package root); `resolveGlob`, a pattern of
 * `import.meta.glob` written in that file, to a glob relative to the package root (undefined when it names no
 * folder of the package: no `./`, `../`, `/` or alias at its start, or outside the root).
 */
export type ModuleResolver = {
	(params: { specifier: string; from: string }): ModuleResolution
	resolveGlob: (params: { pattern: string; from: string }) => string | undefined
	/**
	 * The files the package's vitest config names in `setupFiles` (relative to the package root, each a file of
	 * the package), which run before every test file.
	 */
	setupFiles: readonly string[]
	/** The files the package's vitest config names in `globalSetup`, which run once around the whole run. */
	globalSetupFiles: readonly string[]
	/** The `setupFiles` and `globalSetup` values no file could be read from (a call, an import). */
	unreadableSetup: readonly ConfigUnreadable[]
}

/** A config value naming files that tdd cannot read: its config file, its property and its text. */
export type ConfigUnreadable = { config: string; property: string; text: string }

/** What a config property names: its path literals as written, and the values that cannot be read. */
export type ConfigPaths = { paths: string[]; unreadable: ConfigUnreadable[] }

/** The suite infrastructure of a package as last read, and what it was read from (`suite-infrastructure.ts`). */
export type SuiteInfrastructureReading = {
	files: ReadonlySet<string>
	/** Each config and infrastructure file read, with its size and modification time when read. */
	signature: string
}

/** One `import.meta.glob(...)` call: its patterns as written, the negated ones without their `!`. */
export type MetaGlob = { include: string[]; exclude: string[] }

/** What the test code of a test file is listed from. */
export type TestDependenciesParams = {
	root: string
	/** The test file, relative to the root. */
	file: string
	/** The test-code files of the change, relative to the root. */
	changedTestCode: readonly string[]
	resolveModule: ModuleResolver
	/** Its declared production folders; none when not given. */
	packageJson?: PackageJson
	/** The modules the run reported: a pytest test file's dependencies are the ones its run used. */
	modules?: readonly ReportedModule[]
}

/** The test code a test file depends on, and the local-looking specifiers that resolve nowhere. */
export type TestDependencies = { dependencies: string[]; unresolved: string[] }

/** A vite alias: the specifier prefix and the absolute folder it stands for. */
export type ModuleAlias = { find: string; replacement: string }

/** How to start the package's vitest: a command and the arguments before the files. */
export type PackageVitest = {
	command: string
	arguments: readonly string[]
}

/** A case of a run with where its test call is in its file (undefined when the run gave none). */
export type MovedCaseInput = TestCaseId & { location: SourceLocation | undefined }

/** A test file the change deletes, as the base held it. */
export type DeletedTestFile = { file: string; baseText: string; baseFile?: string }

/**
 * The cases moved out of one source file (deleted, or changed so that it no longer holds them) into
 * `targets`, and whether a target's code around its test calls differs from the source's.
 */
export type MovedGroup = {
	source: string
	cases: TestCaseId[]
	targets: string[]
	surroundingsChanged: boolean
	/** The keys (describe path, call tokens) of the source's test calls the moved cases carry; exact moves only. */
	callKeys?: string[]
}

/** A case matched to the one source holding its test call, with that call's key (describe path, tokens). */
export type MoveCandidate = { testCase: TestCaseId; source: string; key: string }

/** A case written, with the same name and project, in several files: moved from none of them. */
export type AmbiguousMove = { name: string; project: string; files: string[] }

/** What the cases of a change moved from: grouped per source, and the ones that cannot be told apart. */
export type MovedCases = { groups: MovedGroup[]; ambiguous: AmbiguousMove[] }

/**
 * A case with the runner call that registered it (the call in its file that is no test call: a helper's),
 * undefined when it is registered by a direct test call.
 */
export type NamedRegistration = TestCaseId & { runner: string | undefined }

/** A group moved by name: the runner calls at the base and now, for the reviewer. */
export type MovedByNameGroup = MovedGroup & { runnerFrom: string[]; runnerTo: string[] }

export type MovedByNameCases = { groups: MovedByNameGroup[]; ambiguous: AmbiguousMove[] }

/**
 * What the cases of a change moved from (`readMoves`): exactly by their test call, by name when a helper
 * registers them, and the collect-only run of the base the by-name match needed (absent when none ran).
 */
export type TddMoves = {
	exact: MovedCases
	byName: MovedByNameCases
	baseCollect?: BaseCollect
}

/** The collect-only run of the base sources: how many files, how long it took, why it failed. */
export type BaseCollect = { files: number; milliseconds: number; failure?: string }

/** A test call of a file with its offsets in the text: where it starts, ends, and where its callee ends. */
export type LocatedTestCall = TestCall & { start: number; end: number; calleeEnd: number }

/** The test calls of a file, to answer which one a reported location points at. */
export type TestCallIndex = {
	calls: LocatedTestCall[]
	byStart: ReadonlyMap<number, LocatedTestCall>
	lineStarts: readonly number[]
	/** Any call at the location, as `testCallTextAt` reads it, from the file parsed once (a runner's call). */
	callTextAt: (location: SourceLocation) => string | undefined
}

/**
 * The code of a test file outside its test calls: each statement holding no test call, with the describe
 * path around it (a key), recursing into the suites; and every describe path the file has.
 */
export type Surroundings = {
	/** `calls`: the statement holds a call (it may register cases through a runner). */
	statements: Array<{ path: string; text: string; calls: boolean }>
	paths: string[]
}

/**
 * A vitest config of the package root (`vitest*.config.*`, or the vite config the default run reads): the globs its
 * `test.include` and `test.exclude` hold (the default include when it sets none), the config files its `projects`
 * name, and the inline projects of its `projects` (each its own include and exclude). What the reader cannot read (a
 * constant, a spread, a call, a glob or a path to no config of the root) is flagged unread: the config may hold more.
 */
export type VitestConfig = VitestGlobs & {
	/** The config's path, relative to the root. */
	file: string
	/** The config files its `projects` name, relative to the root. */
	projects: string[]
	inlineProjects: VitestGlobs[]
	/** `projects` holds an entry that is neither a string literal path nor an inline object literal, or is no list. */
	projectsUnread: boolean
}

/** The test globs of a config or an inline project: the string literals of its lists, and which list holds more. */
export type VitestGlobs = {
	include: string[]
	exclude: string[]
	/** The include (or the config's `test` itself) holds an element that is no string literal: it may name more. */
	includeUnread: boolean
	/** The exclude holds an element that is no string literal: it may leave more out. */
	excludeUnread: boolean
}

/** A config's string list as read: its string literals, and `unread` when it holds more (or is no array literal). */
export type ConfigList = { strings: string[]; unread: boolean }

/** Whether a config runs a path: yes, no, or unknown (an unread list or project may hold it). */
export type PathHolding = boolean | 'unknown'

/** The vitest configs of a package: every config file found, and the one a run with no `--config` reads. */
export type VitestConfigs = {
	configs: VitestConfig[]
	/** The path of the default config (first `vitest.config.*`, then `vite.config.*`); undefined when none exists. */
	defaultConfig: string | undefined
}

/**
 * Which config holds a test file: the default one (directly or through its projects), another one, none, or unknown
 * (a config the reader cannot fully read, a list with an element that is no literal, may hold it).
 */
export type ConfigHolding =
	| { kind: 'default' }
	| { kind: 'other'; config: string }
	| { kind: 'none' }
	| { kind: 'unknown' }

/** A test file of a run that ran no case of it, refused with the reason (`ZERO_CASE_REASONS`, filled). */
export type ZeroCaseRefusal = { file: string; reason: string }

/** The test files of a run that ran no case: refused with a reason, or no vitest test file at all. */
export type ZeroCaseFiles = {
	refused: ZeroCaseRefusal[]
	/** No vitest config includes them: they leave the selection, never refused nor frozen. */
	notVitest: string[]
	/** pytest files a conftest leaves out of discovery (no module reported): out of the selection as well. */
	pytestIgnored: string[]
}

/** What a red run makes of a changed helper no changed test file depends on (`helper-dependents.ts`). */
export type HelperVerdict = { file: string; frozen: boolean; detail: string }

/** A source file of the package and its text, as read once for a search. */
export type SourceText = { file: string; text: string }

/**
 * The base a lot falls back to when no lot base reads (`fallbackLotBaseOf`): the commit it recorded at its start, or a
 * newer release tag of the package descending from it, the tag named.
 */
export type FallbackLotBase =
	| { commit: string; source: 'recorded' }
	| { commit: string; source: 'release-tag'; tag: string }

/** One tracked change against a base, as the diff reads it: its path (a rename's new one) and its state there. */
export type DiffChange = { file: string; path: TestCodePath }

/**
 * The vitest projects the package's CI runs, read from its own test workflow and the npm scripts it reaches
 * (`ci-test-projects.ts`): the names it passes to `--project`, in first-seen order, and what was read; or every
 * project, with why the reader could not tell.
 */
export type CiTestProjects =
	| { kind: 'projects'; names: string[]; source: string }
	| { kind: 'all'; reason: string }

/** One project as vitest resolves it (`tdd-vitest-projects.ts`), and the asked files it holds. */
export type ProbedProject = {
	/** vitest's resolved name, the one the reporter labels cases with (`browser-all (chromium)`). */
	name: string
	/** The name a browser instance belongs to, else its own. */
	parent: string
	/** Files of one worker share loaded modules: a later file's module mock may not apply. */
	sharesModules: boolean
	/** The asked files (relative to the root) the project holds. */
	holds: string[]
}

/**
 * The projects one tdd command runs its vitest files in: CI's projects, the resolved ones, the files a selected
 * project holds, the vitest files none does, and the lines the command prints before its run.
 */
export type VitestSelection = {
	ci: CiTestProjects
	projects: ProbedProject[]
	held: string[]
	outside: string[]
	notes: string[]
}

/** A `vi.mock(...)` or `vi.doMock(...)` call of a test file: its method and its line (1-based). */
export type ModuleMockCall = { method: 'mock' | 'doMock'; line: number }

/** What the reader made of CI's commands: the project names they pass, the npm scripts read; or why it cannot tell. */
export type CiCommandsRead = { names: string[]; scripts: string[] } | { reason: string }

/** What the probe of a package's vitest projects is given: the vitest installation, the root, the asked files. */
export type VitestProbeInput = {
	/** The folder of the `vitest` package beside the run's `node_modules/.bin/vitest`. */
	vitest: string
	root: string
	/** The asked files, relative to the root. */
	files: string[]
}

/** What the probe writes: each project vitest resolves, or why it could not resolve them. */
export type VitestProbeReport = { projects: ProbedProject[] } | { unresolved: string }

/** A test file a red or green refuses for its module mock: the call made, its line, the sharing project. */
export type ModuleMockRefusal = { file: string; call: string; line: number; project: string }

/** A command's selection of vitest projects, or why it could not be read (its vitest run answers that failure). */
export type CommandVitestSelection = VitestSelection | TestRunFailure

/**
 * The selection of one tdd command, read on its first use: `select` probes once (undefined when no file of the
 * command is a vitest file); `checkBase` probes a base copy once per base, checking it declares every CI name.
 */
export type VitestSelectionReader = {
	/** The selection; `announced`: a probe it starts runs as its own progress step (outside a test run's step). */
	select: (params?: { announced?: boolean }) => Promise<CommandVitestSelection | undefined>
	/** The selection when a `select` already read it; undefined otherwise (never probes). */
	peek: () => CommandVitestSelection | undefined
	checkBase: (params: { root: string; base: string }) => Promise<TestRunFailure | undefined>
}

/** Runs a probe of the vitest projects as a progress step of its own (its running line and duration). */
export type ProbeAnnouncer = <Result>(run: () => Promise<Result>) => Promise<Result>
