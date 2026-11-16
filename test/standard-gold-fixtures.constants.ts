import type { AskRequestRecord } from '../src/lib/knowledge/ask/ask.types.ts'

/** The time stamp of every record of the gold fixtures. */
export const GOLD_RECORD_AT = '2026-11-14T10:00:00.000Z'

/** A whole `request.json` of an ask that needed readers; a case replaces the question. */
export const BASE_REQUEST: AskRequestRecord = {
	schema: 1,
	question: 'a question',
	about: null,
	code: null,
	method: null,
	package: null,
	kind: 'semantic',
	decision: false,
	limit: 10,
	effort: 'medium',
	documents: true,
	standard: null,
}

/** The questions of the recorded asks. */
export const NOT_IN_TEXT_QUESTION = 'Does the standard name a limit for AA_1?'
export const POLARITY_QUESTION = 'May AA_1 hold AAA_1?'
export const FREE_TEXT_QUESTION = 'Why does AA_1 hold AAA_1?'

/** The same question written with a doubled space: it matches its gold item after `normaliseText`. */
export const POLARITY_QUESTION_SPACED = 'May  AA_1 hold AAA_1?'

/** A question no gold item holds. */
export const UNKNOWN_QUESTION = 'A question the gold file does not hold'
