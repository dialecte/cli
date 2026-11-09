import type { InterleavingSeam } from '../handover/handover.types.ts'
import type { Transition, TransitionDraft } from './store.types.ts'

/** What the records call for: the next step's transition, or the time it falls due, or neither (blocked or ended). */
export type StepDecision = { draft?: TransitionDraft; due?: Date }

/** What `playSimulatedLot` takes: the simulated lot's folder and the time it plays at. */
export type PlayParams = {
	lotFolder: string
	/** The injected clock's reading: a step is played when it is due at this time; its transition is stamped with it. */
	now: Date
	/** Called once, after the first read of the last transition and before its publish (a second player goes here). */
	afterRead?: InterleavingSeam
}

/** What a play published (in order), and when the next step falls due (undefined: blocked, stopped or finished). */
export type PlayResult = { published: Transition[]; nextDue: Date | undefined }
