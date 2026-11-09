import type { AnswerRecord, TemporaryFileSeam } from './store.types.ts'

/** What `recordAnswer` takes. */
export type RecordAnswerParams = {
	lotFolder: string
	/** The question's id (`q<k>`). */
	question: string
	answer: string
	/** Who answers; `caller` when left out of a caller question, required (not `caller`) for a person's. */
	by?: string
	now: Date
	/** Called once the answer's temporary file is written and before it is published (a second writer goes here). */
	afterTemporaryWritten?: TemporaryFileSeam
}

/** What a recording returns: whether the answer is new or was recorded already, and the recorded record. */
export type RecordedAnswer = { recorded: 'new' | 'already'; answer: AnswerRecord }
