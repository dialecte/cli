/** Constants of the `ask answer`, answer hook and lot note tests: the person, the words, the files, the claims. */
import { SEMANTIC_QUESTION } from './ask-command-workspace.constants.ts'
import {
	FIRST_CLAUSE_SENTENCE,
	SECOND_CLAUSE_SENTENCE,
	VERDICT_TAG_FILE,
} from './ask-verdict-fixtures.constants.ts'
import { DECLARED_FOLDER } from './standard-selection.constants.ts'

import type { CitedClause } from './ask-verdict-fixtures.types.ts'

/** The person who answers, and the text of the answer. */
export const PERSON = 'person-a'
export const ANSWER_TEXT = 'AA_1 holds AAA_1 exactly once.'

/** The files of an ask folder, a lot and a round the cases read or write. */
export const ANSWER_FILE = 'answer.json'
export const NOTE_LOCK_FILE = 'standard.json.lock'
export const ROUND_CLAIM_FILE = 'verdict.claim'

/** The id the documents of the cases give the cited file. */
export const CITED_FILE = `${DECLARED_FOLDER}/tag`

/** The sentence of each clause and the line of the file that holds it. */
export const CLAUSE_SENTENCES: Record<CitedClause, string> = {
	first: FIRST_CLAUSE_SENTENCE,
	second: SECOND_CLAUSE_SENTENCE,
}
export const CLAUSE_LINES: Record<CitedClause, number> = {
	first: VERDICT_TAG_FILE.split('\n').findIndex((line) => line.includes(FIRST_CLAUSE_SENTENCE)) + 1,
	second:
		VERDICT_TAG_FILE.split('\n').findIndex((line) => line.includes(SECOND_CLAUSE_SENTENCE)) + 1,
}

/** Nine words that no document of the cases holds: a quote that is not in its range. */
export const ABSENT_QUOTE = 'the element AA_1 must never hold any other child at all'

/** A question over 500 characters: the semantic question followed by words of one kind. */
export const LONG_QUESTION = [
	SEMANTIC_QUESTION,
	...Array.from({ length: 120 }, () => 'carefully'),
].join(' ')

/** The longest text of a raised question, and how many characters a cut text must keep at least. */
export const QUESTION_TEXT_LIMIT = 500
export const CUT_TEXT_FLOOR = 400

/** A question holding a line break, and the same question on one line. */
export const MULTI_LINE_QUESTION = 'Explain the intent of AA_1\nin its content model'
export const MULTI_LINE_TEXT = 'A-0001: Explain the intent of AA_1 in its content model'

/** The text of the lot answer to the raised question. */
export const LOT_ANSWER_TEXT = 'AA_1 holds AAA_1 once, a person confirms it.'

/** One year in milliseconds: a claim left this long ago is older than any stale limit. */
export const A_YEAR_MS = 365 * 24 * 60 * 60 * 1000

/** The time stamp pattern of the records. */
export const ISO_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u

/** The lot's note records. */
export const LOT_STANDARD_FILE = 'standard.json'
