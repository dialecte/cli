import type {
	HandoverCardData,
	HandoverEntryState,
	HandoverProbe,
	HandoverState,
} from '../lib/handover/handover.types.ts'
import type { LotStateName, QuestionRecord, TransitionPosition } from '../lib/store/store.types.ts'

/** What `lotResult` takes: the words after the verb, and what the hand-over card is computed with. */
export type LotResultParams = {
	cwd: string
	/** The words after the verb: `<id>` and the options. */
	argv: string[]
	/** The repository-cli probe of the card (the tests stand in for it); the real one when left out. */
	probe?: HandoverProbe
	/** The cli named in the card's run line when the repository's own cannot run hand-overs. */
	cliPath?: string
}

/** The hand-over of a `ready` or `committed` real lot: what to show and what to run. */
export type ResultHandover = {
	name: string
	/** The folder the registry entry names. */
	folder: string
	/** The hand-over's own state (from git) when its folder reads; the registry's otherwise. */
	state: HandoverState | HandoverEntryState
	/** The card `handover show --json` gives; null when the folder does not read. */
	card: HandoverCardData | null
	show: string
	run: string
}

/** An answered question as `lot result` lists it. */
export type ResultQuestion = { id: string; text: string; answer: string; by: string }

/** `lot result` of a `ready` or `committed` lot (33S section 7). */
export type ReadyResultJson = {
	lot: string
	state: LotStateName
	/** Null for a real lot with no registry entry; `{ simulated: true }` for a simulated lot. */
	handover: ResultHandover | { simulated: true } | null
	worktree: string | null
	branch: string
	questions: ResultQuestion[]
	simulated: boolean
}

/** `lot result` of a `failed` or `canceled` lot: the last transition's reason, time and position. */
export type EndedResultJson = {
	state: LotStateName
	reason: string | null
	at: string | null
	position: TransitionPosition | null
}

/** `lot result` of a lot still at work: its state, and its open questions when it is `input-required`. */
export type BusyResultJson = { state: LotStateName; questions: QuestionRecord[] }

/** Every shape `lot result --json` prints. */
export type LotResultJson = ReadyResultJson | EndedResultJson | BusyResultJson
