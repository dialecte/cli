import type { InterleavingSeam } from '../handover/handover.types.ts'
import type { QuestionRecord } from './store.types.ts'

/** What `raiseQuestion` takes: the lot folder, the question's fields, the time and who raises it. */
export type RaiseQuestionParams = {
	lotFolder: string
	audience: QuestionRecord['audience']
	station: string
	text: string
	options?: string[]
	details?: string
	ask?: string
	now: Date
	/** Who raises the question: the transition's `cause.by`. */
	by: string
	/** Called once, after the last transition is read and before the question's transition is published. */
	afterRead?: InterleavingSeam
}

/** The question a raise published: its id (`q<k>`) and the number of its transition. */
export type RaisedQuestion = { id: string; seq: number }
