import type { StoreEntry } from '../src/lib/handover/handover.types.ts'
import type { AnswerHookInput } from '../src/lib/store/answer-hooks.types.ts'
import type { QuestionRecord, Transition } from '../src/lib/store/store.types.ts'
import type { BriefWorkspace } from './brief-workspace.types.ts'

/** A hook that keeps what it receives, and whether the answer file was on disk when it ran. */
export type RecordingHook = {
	calls: AnswerHookInput[]
	sawFile: boolean[]
	hook: (input: AnswerHookInput) => void
}

/** A lot in a scratch workspace: the workspace and the lot folder (real path). */
export type QuestionLot = { workspace: BriefWorkspace; lotFolder: string }

/** What a lot of the question and answer tests holds beside its first transition. */
export type QuestionLotParams = {
	/** The question q1 asks, as a second transition; none asks nothing. */
	question?: QuestionRecord
	/** Transitions after the question's (or after the first when there is none). */
	later?: Transition[]
	registry?: StoreEntry['state']
	simulated?: boolean
}
