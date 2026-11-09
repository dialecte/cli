import type { StoreEntry } from '../src/lib/handover/handover.types.ts'
import type { AnswerRecord, Transition } from '../src/lib/store/store.types.ts'

/** The verbs whose text form prints fields of a lot's records. */
export type PrintedVerb = 'status' | 'wait' | 'result' | 'inbox' | 'recap' | 'answer' | 'stop'

/** A lot the printed-fields test builds: its records, and the verbs run on it. */
export type PrintedKind = {
	title: string
	verbs: readonly PrintedVerb[]
	/** The transitions after the start. */
	later: readonly Transition[]
	answers: readonly AnswerRecord[]
	registry?: StoreEntry['state']
	abandoned?: boolean
	running?: boolean
	/** A simulated lot holding a scenario file. */
	simulated?: boolean
	/** A real lot with its hand-over written (the recap's lot). */
	real?: boolean
}

/** A built lot: where the verbs run from, and its folders. */
export type PrintedLot = {
	cwd: string
	lotFolder: string
	registry: string
	name: string
}

/** A record file of a lot: where it lives, its name there, and a record of the shape it holds. */
export type PrintedFile = {
	where: 'lot' | 'registry'
	name: string
	template: unknown
}
