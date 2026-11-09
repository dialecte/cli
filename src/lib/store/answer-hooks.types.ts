import type { AnswerRecord, QuestionRecord } from './store.types.ts'

/** What an `onAnswered` hook receives: the lot folder, the lot's full name, the question and its recorded answer. */
export type AnswerHookInput = {
	lotFolder: string
	lot: string
	question: QuestionRecord
	answer: AnswerRecord
}

/** A hook run after an answer is recorded and on every `already` retry; it must be idempotent. */
export type AnswerHook = (input: AnswerHookInput) => void
