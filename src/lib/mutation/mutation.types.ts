import type { MUTATION_FAMILIES, MUTATION_MODES, REMOVABLE_FAMILIES } from './mutation.constants.ts'
import type { NodePath } from '@babel/traverse'

/** `"dialecte": { "mutation" }` in a package's package.json, defaults applied. */
export type MutationDeclaration = {
	/** Globs (package-relative, `/` separators) of the files the runner may mutate. */
	scope: string[]
	exclude: string[]
	/** Names of calls whose string and object arguments the error-text ignorer skips. */
	errorFactories: string[]
	fast: { vitestConfig: string }
	full?: { command: string }
}

export type MutationDeclarationResult =
	| { kind: 'none' }
	| { kind: 'declared'; declaration: MutationDeclaration }
	| { kind: 'invalid'; reason: string }

export type MutationTier = 'fast' | 'timeouts' | 'full'

/** The options object handed to StrykerJS (the part this runner sets). */
export type StrykerOptions = {
	mutate: string[]
	testRunner: string
	vitest?: { configFile: string; related: boolean }
	commandRunner?: { command: string }
	coverageAnalysis: string
	incremental?: boolean
	incrementalFile?: string
	ignorers: string[]
	reporters: string[]
	ignorePatterns: string[]
	plugins: string[]
	dialecteMutation: { errorFactories: string[] }
	jsonReporter: { fileName: string }
	/** The config file Stryker reads and merges under these options; an empty one keeps a package's own config out. */
	configFile?: string
	tempDirName: string
	disableTypeChecks: boolean
	timeoutMS: number
	concurrency?: number
}

/** The part of a Stryker plugin declaration this package builds without importing `@stryker-mutator/api`. */
export type StrykerIgnorerPlugin = {
	kind: 'Ignore'
	name: string
	factory: IgnorerFactory
}

export type IgnorerFactory = ((options: IgnorerOptions) => {
	shouldIgnore: (path: never) => string | undefined
}) & {
	inject: readonly string[]
}

/** Why a path is skipped, or `undefined` to keep it mutable. */
export type IgnorerReasonOf = (params: {
	path: NodePath
	errorFactories: readonly string[]
}) => string | undefined

export type IgnorerOptions = { dialecteMutation?: { errorFactories?: string[] } }

export type MutationFamily = (typeof MUTATION_FAMILIES)[number]

type RemovableFamily = (typeof REMOVABLE_FAMILIES)[number]

type MutationRecordBase = {
	line: number
	mutation: string
	/** Why no output can differ; empty until someone writes it - an empty reason is never listed. */
	reason: string
	lineHash: string
	/** Absent on a migrated record: it keeps its reason until a hash is taken. */
	testsHash?: string
}

export type MutationRecord =
	| (MutationRecordBase & { family: RemovableFamily; removable: boolean })
	| (MutationRecordBase & {
			family: Exclude<MutationFamily, RemovableFamily>
			removable?: undefined
	  })

/** Per mutated file, per survivor key. */
export type MutationRecords = Readonly<Record<string, Readonly<Record<string, MutationRecord>>>>

/** scl's `equivalent-mutants.json`. */
export type LegacyRecords = Readonly<
	Record<string, Readonly<Record<string, { line: number; mutation: string; equivalent: string }>>>
>

/** The part of the StrykerJS JSON report the judge reads. */
export type MutationReport = {
	readonly files: Readonly<Record<string, ReportedFile>>
	/** Per test file, the tests of the run with the ids `coveredBy` refers to (numbered per run by Stryker). */
	readonly testFiles?: Readonly<Record<string, { readonly tests: readonly ReportedTest[] }>>
}
export type ReportedTest = { readonly id: string; readonly name: string }
export type ReportedFile = { readonly source: string; readonly mutants: readonly ReportedMutant[] }
export type ReportedMutant = {
	readonly id: string
	readonly mutatorName: string
	readonly replacement?: string
	readonly status: string
	/** Ids of the tests that run this mutant (Stryker's `coveredBy`, per-test coverage). */
	readonly coveredBy?: readonly string[]
	readonly location: { readonly start: Position; readonly end: Position }
}
export type Position = { readonly line: number; readonly column: number }

export type Survivor = {
	readonly file: string
	readonly key: string
	readonly line: number
	readonly mutation: string
	/** `file:line:column-line:column`, the form `--mutate` takes to re-mutate exactly this mutant. */
	readonly range: string
	/** Hash of the mutated line's text (see `hashLine`). */
	readonly lineHash: string
	/** Hash of the tests covering the mutant (see `hashTests`); absent when the report names none. */
	readonly testsHash?: string
}

export type Verdict = {
	readonly survivors: readonly Survivor[]
	/** Survivors the records do not list: no record, an empty reason, or an unknown family. */
	readonly unlisted: readonly Survivor[]
	/** Recorded mutants the run tested that no longer survive. */
	readonly stale: readonly { readonly file: string; readonly key: string }[]
}

export type MutateTarget = {
	readonly file: string
	readonly range?: { readonly start: Position; readonly end: Position }
}

export type MutationMode = (typeof MUTATION_MODES)[number]

/** What `.dialecte/lot.json` says about mutation: nothing (`default`), a mode, or a value no mode is. */
export type MutationModeSetting =
	| { kind: 'default' }
	| { kind: MutationMode }
	| { kind: 'invalid'; reason: string }

/** `running` and `reported` are written; `died` is read (a running run whose process is gone); `abandoned` is written by `abandon`. */
export type RunState = 'running' | 'reported' | 'died' | 'abandoned'

export type RunCounts = {
	killed: number
	survived: number
	timedOut: number
	noCoverage: number
}

/** One run of the store: `<git-common-dir>/dialecte-mutation/runs/<runId>.json`. */
export type RunEntry = {
	runId: string
	pid: number
	startedAt: string
	worktree: string
	branch: string
	lot: string
	tree: string
	mode: MutationMode
	/** The ref a `changed` run diffed against; absent for an audit. */
	base?: string
	/** The `name` of the package.json at the package root the run was started from. */
	package: string
	/** The package root the run was started from (absolute): where a missed ledger update reads its records. */
	packageRoot?: string
	/** When the owner process started, as the system tells it: a live process with the same pid that started at another time is not the owner. */
	ownerStartedAt?: string
	/** The run's `--mutate` targets: what a ledger update counts as covered. */
	targets?: string[]
	/** The survivor keys of the mutants the run detected (killed or timed out); absent, the run kills nothing in the ledger. */
	detected?: string[]
	/** The survivor keys of every mutant the run's report holds (no ledger state reads it: a survivor whose mutant a run no longer holds stays pending). */
	tested?: string[]
	state: RunState
	finishedAt?: string
	counts?: RunCounts
	survivors?: Survivor[]
}

export type LedgerState = 'new' | 'killed' | 'recorded' | 'scheduled'

/** One survivor of the ledger, by its survivor key. */
export type LedgerItem = {
	file: string
	line: number
	mutation: string
	lineHash: string
	testsHash?: string
	package: string
	firstSeen: { runId: string; tree: string; lot: string }
	state: LedgerState
	/** When the last run that reported the survivor started: a run that started earlier never kills it. */
	lastReportedStartedAt?: string
	/** The run that last moved the item (to killed or recorded), so its output can name it. */
	movedBy?: string
	followUp?: string
	reason?: string
}

export type Ledger = Record<string, LedgerItem>

/** `key` is the bare survivor key; the ledger file keys its records `<package>::<key>`. */
export type KeyedLedgerItem = LedgerItem & { key: string }

/** A reported run with what its ledger update reads: the package's committed records and the run's targets. */
export type GivenRun = { run: RunEntry; records: MutationRecords; targets: readonly string[] }

/** The ledger and the ids of the runs it took in, as a reader or writer holding the ledger lock works on them. */
export type LockedLedger = { ledger: Ledger; applied: Set<string>; changed: boolean }

/** What a package still owes: what the hand-over card and guard read. */
export type PendingItems = {
	new: KeyedLedgerItem[]
	died: RunEntry[]
	running: RunEntry[]
}

export type ScheduleResult = { ok: true; scheduled: string[] } | { ok: false; reason: string }
export type AbandonResult = { ok: true } | { ok: false; reason: string }

/** Runs Stryker with these options and answers its exit code; the report is read from `options.jsonReporter.fileName`. */
export type StrykerRunner = (params: { options: StrykerOptions }) => Promise<number>

/** When the process with this pid started, as the system tells it; undefined when it cannot tell. */
export type StartTimeReader = (pid: number) => string | undefined

/** How a reader tells whether a run's owner process still lives: its pid, then its start time. */
export type OwnerCheck = {
	isAlive?: (pid: number) => boolean
	startTimeOf?: StartTimeReader
}

export type MutantsDependencies = {
	runStryker: StrykerRunner
	/** Whether a process lives; the real one by default. */
	isAlive?: (pid: number) => boolean
	/** When a process started; the real one by default. */
	startTimeOf?: StartTimeReader
	/** The clock; the real one by default. */
	now?: () => Date
}

/** What `dialecte mutants status --json` prints for the package. */
export type MutantsStatus = {
	running: RunEntry[]
	died: RunEntry[]
	/** The `new` items by the lot that first saw them. */
	new: Record<string, KeyedLedgerItem[]>
	/** The `scheduled` items by follow-up. */
	scheduled: Record<string, KeyedLedgerItem[]>
}

/** The part of `@stryker-mutator/core` the runner uses. */
export type StrykerModule = {
	Stryker: new (options: StrykerOptions) => { runMutationTest: () => Promise<unknown> }
}
