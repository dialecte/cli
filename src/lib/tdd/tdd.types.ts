import type { PackageJson } from '../package-json.types.ts'
import type { StepProgress } from '../progress/step-progress.types.ts'
import type { SKIPPED_RECEIPT_REASONS, TDD_SUBCOMMANDS } from './tdd.constants.ts'

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

/** An error as the test runner reported it. */
export type ReportedError = { name?: string; message: string; frames: ErrorFrame[] }

export type ReportedCaseState = 'passed' | 'failed' | 'skipped' | 'pending'

/** One test case as the run saw it. */
export type ReportedCase = {
	/** The full name: the describe titles and the test's own, joined with ` > `. */
	name: string
	state: ReportedCaseState
	/** The vitest project that ran it (empty without projects). */
	project: string
	location?: SourceLocation
	errors: ReportedError[]
}

/** One test file as the run saw it: an error at collection (a syntax error, a throw at import) and its cases. */
export type ReportedModule = {
	/** Absolute path. */
	file: string
	errors: ReportedError[]
	cases: ReportedCase[]
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

export type CaseFailure = { kind: FailureKind; message: string }

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
}

/** A test file of the change: its text now, and at the base (undefined when the file is new). */
export type ChangedTestFile = { file: string; text: string; baseText: string | undefined }

/** The tdd state of a lot, as `.dialecte/lot.json` declares it. */
export type LotDeclaration = {
	tdd?: string
	accept?: unknown
	revised?: unknown
	gone?: unknown
	/** Whether and how `dialecte mutants run` mutates the lot: `off`, `changed`, `audit` or `gate`. */
	mutation?: unknown
}

/**
 * A case the lot file names with a reason: accepted without a red, or revised at review.
 * `<file>::<name>` (` [project]` when a project runs it).
 */
export type LotCaseEntry = { case: string; reason: string }

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
/** A case the gate's tdd step judged: its label (`file::name [project]`) and its status there. */
export type JudgedCase = { label: string; status: CaseStatus }

export type TddCheck = {
	status: 'passed' | 'failed' | 'skipped'
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
	/** Where a vitest run announces itself (a start line or a spinner); none when not given. */
	progress?: StepProgress
}

/** An error as vitest hands it to a reporter: its message, name and parsed stack. */
export type RunnerError = {
	name?: string
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
	unfrozen: string[]
	findings: TddFinding[]
	unlisted: UnlistedFile[]
	/** What the cases of the change moved from; absent when nothing moved and no base collect ran. */
	moves?: TddMoves
}

/** A case as a run of its file saw it, with what `tdd` needs to judge it. */
export type RunCase = TestCaseId & {
	state: ReportedCaseState
	failure?: CaseFailure
	/** sha256 of the case's name and its test call now. */
	caseHash: string
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
}

/** Where an import of a test file leads. */
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
}

/** One `import.meta.glob(...)` call: its patterns as written, the negated ones without their `!`. */
export type MetaGlob = { include: string[]; exclude: string[] }

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
export type DeletedTestFile = { file: string; baseText: string }

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
