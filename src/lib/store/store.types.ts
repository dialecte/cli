import type { HandoverRunMarker, StoreEntry } from '../handover/handover.types.ts'

/** The states the engine writes in a transition. `input-required` and `committed` are derived, never written. */
export type EngineState = 'working' | 'ready' | 'failed' | 'canceled'

/** The states a lot reports. */
export type LotStateName = EngineState | 'input-required' | 'committed'

/** What caused a transition. */
export type TransitionCauseKind =
	| 'start'
	| 'station'
	| 'question'
	| 'answer'
	| 'limit'
	| 'fail'
	| 'overlap'
	| 'stop'
	| 'ready'

export type TransitionCause = { kind: TransitionCauseKind; by: string; reason: string }

/** Where the lot stands: step 0 means no station has run. */
export type TransitionPosition = {
	step: number
	of: number
	station: string | null
	round: number | null
}

/** A question as a transition carries it (`id` is `q<k>`). */
export type QuestionRecord = {
	id: string
	audience: 'caller' | 'person'
	station: string
	text: string
	options?: string[]
	details?: string
	ask?: string
}

/** A record of `transitions/<seq>.json`. */
export type Transition = {
	seq: number
	at: string
	lot: string
	state: EngineState
	position: TransitionPosition
	cause: TransitionCause
	question: QuestionRecord | null
	simulated: boolean
}

/** A transition before it has its number. */
export type TransitionDraft = Omit<Transition, 'seq'>

/** A record of `answers/q<k>.json`. */
export type AnswerRecord = { question: string; answer: string; by: string; at: string }

/** `identity.json`. */
export type LotIdentity = {
	schema: number
	name: string
	index: string
	repository: string
	store: string
	worktree: string | null
	branch: string
	base: { ref: string; commit: string }
	feature: string
	effort: { level: string; source: string }
	simulated: boolean
	scenario: string | null
	cli: string
	briefHash: string
	planHash: string
	created: string
}

/** The git folders of the repository a folder is in, found without running git. */
export type StoreLocation = {
	/** The git common folder (real path). */
	common: string
	/** `<common>/dialecte-lots`. */
	store: string
	/** `<common>/dialecte-handover`. */
	registry: string
}

/** Everything `lotState` derives a state from. */
export type LotStateInput = {
	identity: LotIdentity
	transitions: readonly Transition[]
	answers: readonly AnswerRecord[]
	registryEntry: StoreEntry | undefined
	abandonedMarker: { at: string } | undefined
	/** The run marker of a live process (the reader leaves a dead one out). */
	runMarker: HandoverRunMarker | undefined
}

/** What `lotState` derives. */
export type LotStateReport = {
	state: LotStateName
	/** The last transition's `at`; the registry entry's `written` when later and the state comes from the entry. */
	since: string
	/** The last transition's cause is `limit`. */
	limit: boolean
	/** Questions asked and not answered; none on a `canceled`, `failed` or `committed` lot. */
	openQuestions: QuestionRecord[]
}

/** The names inside a lot folder that the store itself writes, by what they hold. */
export type StoreFileNames = Readonly<
	Record<'brief' | 'plan' | 'scenario' | 'identity' | 'transitions' | 'answers' | 'asks', string>
>

/** An open real lot a scope overlaps: its name, and each pair of entries that meet (`<ours> meets <theirs>`). */
export type LotOverlap = { name: string; met: string[] }

/** What `lot status` reports of the worktree and its `.dialecte/lot` link; null for a simulated lot. */
export type WorktreeCheck = 'present' | 'missing'
export type LinkCheck = 'present' | 'missing' | 'dangling' | 'wrong'

/** The command a lot's state calls for next (null: none), and the further ones. */
export type NextCommands = { next: string | null; also: string[] }

/** What a record file holds when published: a text, or bytes written as they are (a brief or a plan as read). */
export type RecordContent = string | Uint8Array

/** What a seam of `publishLotFolder` receives: the folder being built. */
export type LotFolderSeam = (temporaryFolder: string) => void

/** What a seam of `publishOnce` and `replaceWhole` receives: the temporary file written, not yet published. */
export type TemporaryFileSeam = (temporaryPath: string) => void

/** The rule tokens a refused brief carries (33S section 5, D9). */
export type RefusalRule =
	| 'shape'
	| 'repository'
	| 'branch-name'
	| 'branch-exists'
	| 'base'
	| 'plan'
	| 'spec-heading'
	| 'scope'
	| 'behaviour'
	| 'lots-outside-scope'
	| 'scope-not-covered'
	| 'overlap'

/** One refusal of a brief: the field it concerns, the rule token, what is wrong (the overlap's lot is named here). */
export type Refusal = { field: string; rule: RefusalRule; detail: string }

/** Whether an id is looked up for a verb that only reads (the cwd store decides) or one that writes (unique across every store). */
export type ResolveMode = 'read' | 'write'

/**
 * What a word of a lot verb names: the lot (its folder's real path), a folder that is no lot (the review-round
 * verbs use it as they always did; `note` says so when a lot of that id also exists), or a refusal (exit 2).
 */
export type LotResolution =
	| { lot: string }
	| { folder: string; note?: string }
	| { exitCode: 2; output: string }

/** What a verb that needs a lot makes of a word: the lot's folder (real path), or the refusal (exit 2). */
export type LotRequirement = { lot: string } | { exitCode: 2; output: string }

/** What `storeListPath` reads: the environment (`XDG_STATE_HOME`) and the person's home folder. */
export type StoreListLocation = { environment?: NodeJS.ProcessEnv; home?: string }
