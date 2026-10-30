import type { PackageJson } from '../package-json.types.ts'
import type { StepProgress } from '../progress/step-progress.types.ts'
import type { TDD_SUBCOMMANDS } from './tdd.constants.ts'

/**
 * A test case: its file, relative to the package root, its full name as vitest prints it
 * (`describe > it`), and the vitest project that runs it (empty without projects). A case run by two
 * projects is two cases: each must earn its own receipts.
 */
export type TestCaseId = { file: string; name: string; project: string }

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
	/** A red at a production state an earlier, superseded receipt of the case already had: code rolled back. */
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

/** The test code a red run froze: each file (test files, helpers, fixtures, snapshots) with its sha256. */
export type TddFreeze = { kind: 'freeze'; files: Record<string, string>; at: string }

export type TddEntry = TddReceipt | TddFreeze

/** Everything a worktree's `tdd` commands recorded, oldest first: the order decides what "later" means. */
export type TddLedger = { version: 3; entries: TddEntry[] }

export type CaseStatus =
	| 'red'
	| 'green'
	| 'unchanged'
	| 'accepted'
	| 'revised'
	| 'missing receipt'
	| 'test edited after red'

export type CaseStatusLine = TestCaseId & { status: CaseStatus; flags: ReceiptFlag[] }

/** A test file of the change: its text now, and at the base (undefined when the file is new). */
export type ChangedTestFile = { file: string; text: string; baseText: string | undefined }

/** The tdd state of a lot, as `.dialecte/lot.json` declares it. */
export type LotDeclaration = { tdd?: string; accept?: unknown; revised?: unknown }

/**
 * A case the lot file names with a reason: accepted without a red, or revised at review.
 * `<file>::<name>` (` [project]` when a project runs it).
 */
export type LotCaseEntry = { case: string; reason: string }

/** The lists of cases a lot file may hold. */
export type LotCaseList = 'accept' | 'revised'

/** What the command line names: cases (`<file>::<name>`) and files. */
export type TddTargets = { cases: Array<{ file: string; name: string }>; files: string[] }

/** A changed test file whose cases cannot be listed: it fails while loading. */
export type UnlistedFile = { file: string; failure: CaseFailure }

export type TddSubcommand = (typeof TDD_SUBCOMMANDS)[number]

/** The gate's `tdd` step: passed with a note, skipped or failed with a reason, and the lines that show why. */
export type TddCheck = {
	status: 'passed' | 'failed' | 'skipped'
	note?: string
	reason?: string
	lines?: string[]
	/** Evidence shown under a passed step: flags, deleted cases. */
	details?: string[]
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

/** A test call of a file: its title as written (undefined when computed) and its source. */
export type TestCall = { title: string | undefined; text: string }

/** What the review should see beside the case statuses: test cases gone since the base, a file left out. */
export type TddFinding = { file: string; detail: string }

/**
 * The state of the change's test code and cases, as `tdd status` and the gate read it: each case, the test
 * code changed since the last red run that froze it, the deleted cases, the files that cannot be listed.
 */
export type TddState = {
	cases: CaseStatusLine[]
	unfrozen: string[]
	findings: TddFinding[]
	unlisted: UnlistedFile[]
}

/** A case as a run of its file saw it, with what `tdd` needs to judge it. */
export type RunCase = TestCaseId & {
	state: ReportedCaseState
	failure?: CaseFailure
	/** sha256 of the case's name and its test call now. */
	caseHash: string
	/** New or changed since the base, by its test call and titles. */
	ofChange: boolean
}

/** Where an import of a test file leads. */
export type ModuleResolution =
	| { kind: 'local'; file: string }
	| { kind: 'package' }
	| { kind: 'unresolved' }

/** Resolves a specifier imported by a file (both relative to the package root). */
export type ModuleResolver = (params: { specifier: string; from: string }) => ModuleResolution

/** A vite alias: the specifier prefix and the absolute folder it stands for. */
export type ModuleAlias = { find: string; replacement: string }
