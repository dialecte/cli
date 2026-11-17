import type { LotIdentity } from '../store/store.types.ts'

/** The verdict of one comparison, and of a lot's forecast (the worst of its comparisons). */
export type ForecastVerdict = 'clean' | 'exclusive' | 'conflict' | 'unknown'

/** What ran the forecast. CO2a writes `forecast` only; the others are the triggers CO2b wires. */
export type ForecastTrigger = 'start' | 'scope' | 'gate' | 'forecast' | 'land'

/** A line range of a conflict in the merged file, both ends included, 1-based. */
export type ConflictRange = [number, number]

/** One conflicted path: its kind (`content`, `modify/delete`, ...) and, for a content conflict, its line ranges. */
export type ForecastConflict = { path: string; kind: string; lines: ConflictRange[] }

/** A lot's work as one commit: its HEAD, the snapshot of HEAD plus its uncommitted work, and whether it was dirty. */
export type LotSnapshot = { commit: string; snapshot: string; dirty: boolean }

/** The self or other side of a line: the snapshot when it was taken, nulls when it could not be. */
export type ForecastSide = { commit: string | null; snapshot: string | null; dirty: boolean | null }

/** One line of `forecast.jsonl`: one comparison of a run (against main or one other open lot). */
export type ForecastLine = {
	schema: 1
	run: string
	at: string
	trigger: ForecastTrigger
	/** The number of lines of the run: a run with fewer lines reads as torn. */
	of: number
	self: ForecastSide
	main: { ref: string; commit: string | null }
	/** `main` or the other lot's name. */
	against: string
	other?: ForecastSide
	verdict: ForecastVerdict
	shared?: string[]
	conflicts?: ForecastConflict[]
	/** Conflict paths left out of the line (over the cap or the line limit). */
	more?: number
	/** Shared paths left out of the line. */
	moreShared?: number
	/** Why the comparison is unknown. */
	reason?: string
}

/** The newest complete run of `forecast.jsonl`, and how many lines do not read as part of a complete run. */
export type ForecastRecord = { lines: ForecastLine[]; unreadable: number }

/** What one comparison found, before it is written as a line. */
export type ComparisonOutcome =
	| { verdict: 'clean' | 'conflict' | 'exclusive'; shared: string[]; conflicts: ForecastConflict[] }
	| { verdict: 'unknown'; reason: string }

/** One git step bounded by a time limit: its exit status, outputs, and whether it ran over the limit. */
export type BoundedGitResult = {
	status: number | null
	stdout: string
	stderr: string
	timedOut: boolean
}

/** Copies the worktree's index file to the scratch file (injected by a test to see that no copy is made). */
export type CopyIndex = (params: { from: string; to: string }) => void

/** What a forecast run needs: the lot, an optional single other lot, the trigger, the clock and the time limit. */
export type ForecastLotParams = {
	lotFolder: string
	/** Only the comparison against main and against this lot's name. */
	against?: string
	trigger: ForecastTrigger
	now?: () => Date
	/** The limit of each git step, in milliseconds (`FORECAST_STEP_LIMIT_MS` by default). */
	stepLimitMs?: number
	copyIndex?: CopyIndex
	/** Only the comparison against main: no other lot is read (a start reads a met lot's work so). */
	mainOnly?: boolean
}

/** Why a lot has no forecast: it is gone, damaged, simulated or no longer open. */
export type ForecastRefusal = { refusal: string }

/** What a forecast of a lot gives: its run, or why the lot has none. */
export type ForecastOutcome = ForecastRun | ForecastRefusal

/** What recording a run left: whether its lines were written, and the lines to print (a write that failed). */
export type RecordedForecast = {
	written: boolean
	notes: string[]
	/** The run's event could not be written (its note among `notes`): a caller that warns of its events already skips it. */
	eventFailed?: true
}

/** One pair of a lot's merged view: the other lot, the newer line of the two sides, and whose line it is. */
export type ForecastPairView = { lot: string; line: ForecastLine; from: 'self' | 'other' }

/** A lot's forecast as its readers show it (files only): its newest main line, and per other open lot the newer side. */
export type ForecastView = { main: ForecastLine | undefined; pairs: ForecastPairView[] }

/** A forecast run: its id, its lines (one per comparison), the worst verdict and the time it took. */
export type ForecastRun = {
	run: string
	lines: ForecastLine[]
	verdict: ForecastVerdict
	durationMs: number
}

/** An open lot of the store as the forecast reads it: its identity, or why it is damaged. */
export type OpenLot = { name: string; identity: LotIdentity } | { name: string; damage: string }

/** A lot's work taken: its snapshot, or why it could not be taken. */
export type TakenWork = LotSnapshot | { reason: string }

/** Main as a run sees it: origin's ref with its commit, or why it does not resolve. */
export type ForecastMain = { ref: string; commit: string } | { ref: string; reason: string }

/** What every comparison of a run reads: the repository, the limit, main and the lot's own work. */
export type RunContext = {
	root: string
	limitMs: number
	selfName: string
	main: ForecastMain
	self: TakenWork
	/** The paths the lot's own work conflicts on against main (none when that comparison did not run). */
	selfMainPaths: ReadonlySet<string>
}

/** One comparison before it is a line: against what, both sides and main as seen, and its outcome. */
export type Comparison = {
	against: string
	self: ForecastSide
	other?: ForecastSide
	main: { ref: string; commit: string | null }
	outcome: ComparisonOutcome
}

/** What one merge runs on: the repository, the two commits, the lot named in an over-time reason, the limit. */
export type MergeParams = {
	root: string
	ours: string
	theirs: string
	lot: string
	limitMs: number
}

/** The gate's forecast of its lot: the run's verdict and lines, and the text it prints. */
export type GateForecast = { verdict: ForecastVerdict; lines: ForecastLine[]; text: string[] }
