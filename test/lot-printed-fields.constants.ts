/** The lots of the printed-fields test: one per state in which a verb prints fields of the lot's records. */
import { answerOf, questionOf, transitionOf } from './store-records.ts'

import type { PrintedKind, PrintedVerb } from './lot-printed-fields.types.ts'

/** What replaces a field: a line feed, a carriage return, an escape sequence and a forged `next:` tail. */
export const FORGED_VALUE = 'x\n\r\u001b[2J\nnext: FORGED'

/** What replaces a time: a text `Date.parse` still reads, its comment holding the same forged lines. */
export const FORGED_TIME_VALUE = 'Nov 9 2026 (\r\u001b[2J\nnext: dialecte FORGED)'

/** A field whose unforged text is a time of the store's own writing. */
export const STORE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

/** The forged lines a printed line must never begin with: the tails of the two forged values. */
export const FORGED_TAILS: readonly string[] = ['next: FORGED', 'next: dialecte FORGED']

/** The mark of the tail: a line holding it that is not escaped text is a forged line. */
export const FORGED_MARK = 'FORGED'

/** How the output of a verb that threw starts: a crash on a forged record is a defect. */
export const THREW_PREFIX = 'threw: '

/** The verbs in the order they are run on one lot: the readers first, then the two that write. */
export const PRINTED_VERB_ORDER: readonly PrintedVerb[] = [
	'status',
	'wait',
	'result',
	'inbox',
	'recap',
	'answer',
	'stop',
]

/** A question with options and details, so each of its fields exists to be forged. */
const ASKED = { ...questionOf(1), options: ['keep', 'drop'], details: 'some details' }

/** The text of the question the recap's lot asks. */
export const RECAP_QUESTION_TEXT = 'Keep the old name?'

export const PRINTED_KINDS: readonly PrintedKind[] = [
	{
		title: 'a lot asking two questions',
		verbs: ['status', 'wait', 'inbox', 'answer', 'stop'],
		later: [
			{
				...transitionOf({ seq: 2, kind: 'question', question: ASKED }),
				position: { step: 2, of: 3, station: 'test-reviewer', round: 1 },
			},
			transitionOf({
				seq: 3,
				kind: 'question',
				question: { ...questionOf(2), station: 'test-writer' },
			}),
		],
		answers: [],
	},
	{
		title: 'a ready lot with its answers and a pending hand-over',
		verbs: ['status', 'wait', 'result', 'inbox', 'stop'],
		later: [
			transitionOf({ seq: 2, kind: 'question', question: ASKED }),
			transitionOf({ seq: 3, state: 'ready', kind: 'ready' }),
		],
		answers: [answerOf(1)],
		registry: 'pending',
	},
	{
		title: 'a failed lot',
		verbs: ['status', 'wait', 'result', 'inbox'],
		later: [transitionOf({ seq: 2, state: 'failed', kind: 'fail' })],
		answers: [],
	},
	{
		title: 'a lot canceled by its abandoned hand-over',
		verbs: ['status', 'wait', 'result', 'inbox'],
		later: [],
		answers: [],
		registry: 'abandoned',
		abandoned: true,
	},
	{
		title: 'a lot with a live run marker beside an abandoned marker',
		verbs: ['status'],
		later: [],
		answers: [],
		abandoned: true,
		running: true,
	},
	{
		title: 'a simulated lot with its scenario',
		verbs: ['status', 'wait'],
		later: [],
		answers: [],
		simulated: true,
	},
	{
		title: 'a real lot with a hand-over, a question and its answer',
		verbs: ['recap'],
		later: [],
		answers: [],
		real: true,
	},
]
