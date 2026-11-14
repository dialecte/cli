import type { HandoverEntryState } from '../lib/handover/handover.types.ts'
import type { Effort, RiskDerivedLine } from '../lib/risk/risk.types.ts'
import type { NextStation } from '../lib/store/next-station.types.ts'
import type { BeyondCapRow } from '../lib/store/station-records.types.ts'
import type {
	LinkCheck,
	LotIdentity,
	LotStateName,
	QuestionRecord,
	Refusal,
	TransitionPosition,
	WorktreeCheck,
} from '../lib/store/store.types.ts'

/** The station block of the status JSON: the walk's next, `null` for a simulated lot (33L1 section 4, "Output"). */
export type StationStatus = NextStation

/** The rounds block of the status JSON: snapshots, the cap, the go-aheads above it, the independent rounds. */
export type RoundsStatus = {
	/** The `round-<n>/` snapshots (the count is the snapshots only). */
	review: number
	/** The cap of review rounds (`riskCapOf`); null when no effort is known. */
	cap: number | null
	/** The effort the cap is taken from (`effectiveEffort`: the last effort line's, else the identity's); null when neither says. */
	effort: Effort | null
	/** The brief's step count (at least 1, D13). */
	steps: number
	/** The go-ahead rows of `decisions.md` for the rounds above the cap. */
	beyondCap: BeyondCapRow[]
	/** The distinct ledger rounds above the last snapshot. */
	independent: number
}

/** The effort block of the status JSON (33L1 D25): the effective effort, where it came from, the class, below or not. */
export type LotStatusEffort = {
	/** The last effort line's effort, else the identity's level. */
	level: string
	/** `risk-line` when an effort line is current, else the identity's source. */
	source: string
	/** The last derived line's class, time and reasons; null when no derived line stands. */
	riskClass: Pick<RiskDerivedLine, 'class' | 'at' | 'reasons'> | null
	/** The effort's class is below `riskClass`. */
	below: boolean
}

/** What `lot status --json` prints (33S section 7, D17). */
export type LotStatusJson = {
	lot: string
	index: string
	feature: string
	repository: string
	branch: string
	base: LotIdentity['base']
	worktree: string | null
	folder: string
	state: LotStateName
	since: string
	limit: boolean
	runner: string
	position: TransitionPosition | null
	/** The open questions, each with the time its transition asked it. */
	questions: Array<QuestionRecord & { asked: string }>
	answered: number
	handover: { name: string; state: HandoverEntryState } | null
	/** Null when neither an effort line nor the identity records an effort. */
	effort: LotStatusEffort | null
	simulated: boolean
	scenario: string | null
	checks: {
		worktree: WorktreeCheck | null
		link: LinkCheck | null
		/** The brief findings a simulated start recorded instead of refusing; none for a real lot. */
		wouldRefuse: Refusal[]
	}
	notes: string[]
	next: string | null
	also: string[]
	/** The next station from the records; null for a simulated lot. */
	station: StationStatus | null
	rounds: RoundsStatus
}
