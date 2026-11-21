import type { EventRun, LotEvent } from '../events/event.types.ts'
import type { CheckKey, GateRecord } from '../gate-records/gate-records.types.ts'
import type { RehearsalDecision } from '../handover/handover.types.ts'
import type { DAMAGED_STATE } from '../store/store.constants.ts'
import type { LotStateName } from '../store/store.types.ts'

export type HealthSeverity = 'red' | 'amber'
export type HealthRule = 'duplicate-work' | 'landing-time' | 'stalled-run' | 'worktrees'
export type HealthFinding = {
	rule: HealthRule
	severity: HealthSeverity
	/** Basename of the repository folder (the parent of its git common dir). */
	repository: string
	/** Lot folder name. */
	lot?: string
	/** ISO 8601. */
	at: string
	text: string
	detail: string[]
	next?: string
}
/** A lot's rehearsal.json as `handover run --rehearse` writes it. */
export type RehearsalPlan = { at: string; lots: RehearsalDecision[] }
export type HealthLot = {
	name: string
	folder: string
	/** readEvents, sorted. */
	events: LotEvent[]
	/** pairRuns of those events. */
	runs: EventRun[]
	rehearsal?: RehearsalPlan
	/** The lot's state as the store reads it (`damaged` for a damaged lot); absent when the folder holds no lot records. */
	state?: LotStateName | typeof DAMAGED_STATE
	/** The worktree the lot's identity names, by real path; absent when the identity names none or does not read. */
	worktree?: string
	/** The lot is kept on purpose (`keep.jsonl`): its own worktree is held, never idle (KEEP 3.5.5). */
	kept?: true
}
export type HealthRepository = {
	name: string
	/** The git common dir. */
	common: string
	lots: HealthLot[]
	/** Every record of every `<common>/dialecte-checks/<tree>.json`. */
	records: GateRecord[]
	/**
	 * The worktrees registered in `<common>/worktrees/` (the reader always sets it; a repository built for one rule
	 * may leave it out, read as none).
	 */
	worktrees?: HealthWorktree[]
}
export type HealthWindow = { since: Date; now: Date }

/** A run of a lot's events that ended: its lot folder name, its start (when written) and its end. */
export type LotRun = { lot: string; start: LotEvent | undefined; end: LotEvent }

/** A run with its start and its end. */
export type ClosedLotRun = LotRun & { start: LotEvent }

/** What the duplicate-work finders share: the repository, the window, its ended runs and its records by tree. */
export type DuplicateWorkInput = {
	repository: HealthRepository
	window: HealthWindow
	/** Every ended run of every lot, in time order of their ends. */
	runs: LotRun[]
	recordsByTree: ReadonlyMap<string, GateRecord[]>
}

/** The store-pair findings, and the ends of the runs they name (an identical-key finding on one is not repeated). */
export type StorePairResult = { findings: HealthFinding[]; namedEnds: ReadonlySet<LotEvent> }

/** What makes two step ends the same check: the step, the state hash and the check key. */
export type EndIdentity = { step: string; stateHash: string; key: CheckKey }

/** A run of a lot's events that started, with its lot folder name; its end is missing while it runs or when it was killed. */
export type StartedLotRun = { lot: string; start: LotEvent; end: LotEvent | undefined }

/** What a commit hook's part of a landing finding reads: its run, its number, the lot's duplicates and the records. */
export type LandingHookInput = {
	hook: StartedLotRun
	/** The hook's number among the handover run's hooks, from 1 in start order. */
	index: number
	/** The duplicate-work findings of the lot. */
	duplicates: readonly HealthFinding[]
	recordsByTree: ReadonlyMap<string, GateRecord[]>
}

/** A commit hook's part of a landing finding: its text, and whether a duplicate-work finding names it. */
export type LandingHookPart = { text: string; duplicate: boolean }

/** A worktree registered in `<common>/worktrees/<name>/`, read from files only. */
export type HealthWorktree = {
	/** The folder name under `<common>/worktrees/`. */
	name: string
	/** The dirname of the path in `<common>/worktrees/<name>/gitdir` (that file holds `<path>/.git`). */
	path: string
	/** The path does not exist. */
	gone: boolean
	/** Birth time of `<common>/worktrees/<name>`, ISO. */
	createdAt: string
	/** Newest mtime of `<common>/worktrees/<name>/index` and `HEAD` (those that exist), ISO. */
	activeAt: string
	/** The `<common>/dialecte-handover/*.json` entry whose worktree is `path`. */
	handover?: { state: string; closed?: string }
}

/** A scratch folder of the cli in the temporary folder, with its modification time (ISO). */
/**
 * A scratch folder of the cli: its path, when it was made (its scratch.json's start, else its modification time) and
 * the process its scratch.json names, when it has one.
 */
export type ScratchFolder = { path: string; modifiedAt: string; pid?: number }
