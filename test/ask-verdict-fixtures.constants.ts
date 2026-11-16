/** Constants of the `ask verdict` tests: the documents the readers cite, the reports they write, the folders. */
import { DECLARED_FOLDER } from './standard-selection.constants.ts'
import { buildSyntheticStandard } from './synthetic-standard.ts'

/** Two clauses naming the test dialecte's AA_1 element, each with a sentence of more than eight words. */
export const FIRST_CLAUSE_SENTENCE =
	'In this clause the element AA_1 shall hold the child AAA_1 in its content model.'
export const SECOND_CLAUSE_SENTENCE =
	'In the second clause the element AA_1 shall hold the child AAA_1 once more in its content model.'

/** The words that tell the second clause's lines from the first's, and the words every cited line holds. */
export const SECOND_CLAUSE_MARKER = 'second clause'
export const CITED_LINE_MARKER = 'shall'

/** The first sentence without its first three words: a shorter quote of the same line that still holds every key term. */
export const FIRST_SENTENCE_TAIL =
	'the element AA_1 shall hold the child AAA_1 in its content model'

/** The root of the documents of the verdict cases: one folder, one file of two clauses. */
export const VERDICT_TAG_FILE = buildSyntheticStandard({
	blocks: [
		{ kind: 'heading', number: '1', title: 'Overview' },
		{ kind: 'raw', lines: [FIRST_CLAUSE_SENTENCE] },
		{ kind: 'blank' },
		{ kind: 'heading', number: '2', title: 'Parts' },
		{ kind: 'raw', lines: [SECOND_CLAUSE_SENTENCE] },
	],
})
export const VERDICT_STANDARDS = { [DECLARED_FOLDER]: { 'tag.md': VERDICT_TAG_FILE } }

/** The folder beside the project the report files are written in. */
export const REPORTS_FOLDER = 'reports'

/** What a report says: the claim, the answers (a short and a long one), the session of each reader. */
export const CLAIM_TEXT = 'AA_1 shall hold AAA_1'
export const ANSWER_SHORT_TEXT = 'AA_1 holds AAA_1.'
export const ANSWER_LONG_TEXT = 'Yes, the element AA_1 holds the child AAA_1 in its content model.'

/** The question of a `--decision` ask the definition bounds, and the list the readers agree on. */
export const DECISION_QUESTION = 'children of AA_1'
export const DECISION_AGREED_VALUE = 'AAA_1, AAA_9'
export const DECISION_BOUNDED_VALUE = 'AAA_1'
export const DECISION_REJECTED_ITEM = 'AAA_9'

/** The members of `ask verdict --json`, sorted. */
export const VERDICT_JSON_KEYS = [
	'ask',
	'conflict',
	'fact',
	'next',
	'reason',
	'reports',
	'round',
	'schema',
	'state',
] as const

/** The web cite of an outside reader that searched the web: its page, 8 to 40 words of it, the day retrieved. */
export const WEB_CITE = {
	url: 'https://example.test/page',
	quote: 'the element AA_1 shall hold the child AAA_1 in its content model',
	retrieved: '2026-11-14',
}

/** The file the adjudicator's brief is written to in the round folder, as json and as markdown. */
export const ADJUDICATOR_BRIEF_JSON = 'adjudicator.json'
export const ADJUDICATOR_BRIEF_MARKDOWN = 'adjudicator.md'

/** The folder of the first fact of a ledger and the used folder of a round. */
export const FIRST_FACT = 'F-0001'
export const USED_FOLDER = 'used'
