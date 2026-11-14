import type { HandoverEntryState } from '../lib/handover/handover.types.ts'
import type { BriefEffort } from '../lib/store/brief.types.ts'
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
	/** The cap of the lot's effort; null when no effort is known. */
	cap: number | null
	/** The effort the cap is taken from (the identity's, else the brief's, D2); null when neither says. */
	effort: BriefEffort | null
	/** The brief's step count (at least 1, D13). */
	steps: number
	/** The go-ahead rows of `decisions.md` for the rounds above the cap. */
	beyondCap: BeyondCapRow[]
	/** The distinct ledger rounds above the last snapshot. */
	independent: number
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
	effort: LotIdentity['effort']
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
