import type { HandoverEntryState } from '../lib/handover/handover.types.ts'
import type {
	LinkCheck,
	LotIdentity,
	LotStateName,
	QuestionRecord,
	Refusal,
	TransitionPosition,
	WorktreeCheck,
} from '../lib/store/store.types.ts'

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
}
