import {
	ANSWER_LONG,
	ANSWER_SHORT,
	CLAUSE_TWO,
	LINES_FIRST,
	LINES_SHARING,
} from '../../../../test/ask-agreement-fixtures.constants.ts'
import { documentAcceptedOf } from '../../../../test/ask-agreement-fixtures.ts'
import { QUOTE_D_POSITIVE } from '../../../../test/ask-report-fixtures.constants.ts'
import { citeOf } from '../../../../test/ask-report-fixtures.ts'
import { ROUND_CEILING } from './ask.constants.ts'
import { roundOutcomeOf } from './round-outcome-of.ts'

import { describe, expect, it } from 'vitest'

import type { AcceptedReport, RoundOutcomeOfParams } from './ask.types.ts'

/** The closed round of a case: round 1 with something left to give, unless said. */
function roundOf(
	params: Pick<RoundOutcomeOfParams, 'effort' | 'accepted'> &
		Partial<Pick<RoundOutcomeOfParams, 'round' | 'anythingLeft'>>,
): RoundOutcomeOfParams {
	return { round: 1, anythingLeft: true, outside: false, ...params }
}

/** Reports that agree: A and B at yes, sharing the first lines. */
const AGREEING: AcceptedReport[] = [
	documentAcceptedOf({ letter: 'A' }),
	documentAcceptedOf({ letter: 'B' }),
]

/** Reports that do not: A at yes, B at no. */
const DISAGREEING: AcceptedReport[] = [
	documentAcceptedOf({ letter: 'A', verdict: 'yes' }),
	documentAcceptedOf({ letter: 'B', verdict: 'no' }),
]

/** Reports that all say not-in-text. */
const NOT_IN_TEXT: AcceptedReport[] = [
	documentAcceptedOf({ letter: 'A', verdict: 'not-in-text' }),
	documentAcceptedOf({ letter: 'B', verdict: 'not-in-text' }),
]

const PERSON = { state: 'needs-person', reason: expect.stringMatching(/\S/u) }
const ANSWERED = { state: 'answered' }

const EFFORT_ROWS: Record<string, { params: RoundOutcomeOfParams; outcome: unknown }> = {
	'low: A and B agree -> answered': {
		params: roundOf({ effort: 'low', accepted: AGREEING }),
		outcome: ANSWERED,
	},
	'low: A and B disagree in the only round -> the person': {
		params: roundOf({ effort: 'low', accepted: DISAGREEING }),
		outcome: PERSON,
	},
	'medium: A and B agree in round 1 -> answered': {
		params: roundOf({ effort: 'medium', accepted: AGREEING }),
		outcome: ANSWERED,
	},
	'medium: A and B disagree in round 1 -> another round': {
		params: roundOf({ effort: 'medium', accepted: DISAGREEING }),
		outcome: { state: 'next-round', reason: 'disagreement' },
	},
	'medium: A and B agree in round 2 -> answered': {
		params: roundOf({ effort: 'medium', round: 2, accepted: AGREEING }),
		outcome: ANSWERED,
	},
	'medium: A and B disagree in round 2 -> the person': {
		params: roundOf({ effort: 'medium', round: 2, accepted: DISAGREEING }),
		outcome: PERSON,
	},
	'high: A, B and C agree -> answered': {
		params: roundOf({
			effort: 'high',
			accepted: [...AGREEING, documentAcceptedOf({ letter: 'C' })],
		}),
		outcome: ANSWERED,
	},
	'high: A and B agree and C has no verified claim for another verdict (not-in-text) -> answered': {
		params: roundOf({
			effort: 'high',
			accepted: [...AGREEING, documentAcceptedOf({ letter: 'C', verdict: 'not-in-text' })],
		}),
		outcome: ANSWERED,
	},
	'high: A, B and C all differ in round 2 -> another round': {
		params: roundOf({
			effort: 'high',
			round: 2,
			accepted: [
				documentAcceptedOf({ letter: 'A', verdict: 'yes' }),
				documentAcceptedOf({ letter: 'B', verdict: 'no' }),
				documentAcceptedOf({ letter: 'C', verdict: 'depends', value: 'a condition' }),
			],
		}),
		outcome: { state: 'next-round', reason: 'disagreement' },
	},
}

describe('roundOutcomeOf: the effort table (section 8)', () => {
	it.each(Object.entries(EFFORT_ROWS))('%s', (_title, row) => {
		expect(roundOutcomeOf(row.params)).toMatchObject(row.outcome as object)
	})
})

describe('roundOutcomeOf: a verified dissent at high is another round, never outvoted (case 29)', () => {
	it('A and B agree and C dissents with a verified claim -> another round named dissent, not answered', () => {
		const accepted = [...AGREEING, documentAcceptedOf({ letter: 'C', verdict: 'no' })]

		expect(roundOutcomeOf(roundOf({ effort: 'high', accepted }))).toEqual({
			state: 'next-round',
			reason: 'dissent',
		})
	})

	it('the same dissent in the last round of the effort -> the adjudicator, no agreement', () => {
		const accepted = [...AGREEING, documentAcceptedOf({ letter: 'C', verdict: 'no' })]

		expect(roundOutcomeOf(roundOf({ effort: 'high', round: 3, accepted }))).toEqual({
			state: 'needs-adjudicator',
			reason: 'no-agreement',
		})
	})
})

describe('roundOutcomeOf: a round with nothing verified searches again while something is left (cases 32, 32b)', () => {
	const rows: Record<string, { params: RoundOutcomeOfParams; outcome: unknown }> = {
		'low: all not-in-text with something left -> another round named not-in-text': {
			params: roundOf({ effort: 'low', accepted: NOT_IN_TEXT }),
			outcome: { state: 'next-round', reason: 'not-in-text' },
		},
		'medium round 2: all not-in-text with something left -> another round: the effort does not cap it':
			{
				params: roundOf({ effort: 'medium', round: 2, accepted: NOT_IN_TEXT }),
				outcome: { state: 'next-round', reason: 'not-in-text' },
			},
		'high round 3: all not-in-text with something left -> another round, never the adjudicator': {
			params: roundOf({ effort: 'high', round: 3, accepted: NOT_IN_TEXT }),
			outcome: { state: 'next-round', reason: 'not-in-text' },
		},
		'no accepted report at all (every one kept no verified claim) with something left -> another round':
			{
				params: roundOf({ effort: 'low', accepted: [] }),
				outcome: { state: 'next-round', reason: 'not-in-text' },
			},
		'all not-in-text and nothing left -> the person': {
			params: roundOf({ effort: 'low', accepted: NOT_IN_TEXT, anythingLeft: false }),
			outcome: PERSON,
		},
		'all not-in-text at the round ceiling, though something is left -> the person': {
			params: roundOf({ effort: 'high', round: ROUND_CEILING, accepted: NOT_IN_TEXT }),
			outcome: PERSON,
		},
	}

	it.each(Object.entries(rows))('%s', (_title, row) => {
		expect(roundOutcomeOf(row.params)).toMatchObject(row.outcome as object)
	})
})

describe('roundOutcomeOf: no agreement after the effort rounds, and a polarity conflict (case 30)', () => {
	const conflicted: AcceptedReport[] = [
		documentAcceptedOf({ letter: 'A', polarityConflict: true }),
		documentAcceptedOf({ letter: 'B' }),
	]
	const rows: Record<string, { params: RoundOutcomeOfParams; outcome: unknown }> = {
		'high round 3: the readers still disagree -> the adjudicator': {
			params: roundOf({
				effort: 'high',
				round: 3,
				accepted: [
					documentAcceptedOf({ letter: 'A', verdict: 'yes' }),
					documentAcceptedOf({ letter: 'B', verdict: 'no' }),
					documentAcceptedOf({ letter: 'C', verdict: 'depends', value: 'a condition' }),
				],
			}),
			outcome: { state: 'needs-adjudicator', reason: 'no-agreement' },
		},
		'high round 1: a polarity conflict on one report -> the adjudicator, without waiting for other rounds':
			{
				params: roundOf({ effort: 'high', accepted: conflicted }),
				outcome: { state: 'needs-adjudicator', reason: 'polarity-conflict' },
			},
		'high round 1: a polarity conflict on A while B and C agree -> the adjudicator: it never counts toward agreement':
			{
				params: roundOf({
					effort: 'high',
					accepted: [...conflicted, documentAcceptedOf({ letter: 'C' })],
				}),
				outcome: { state: 'needs-adjudicator', reason: 'polarity-conflict' },
			},
		'medium round 1: a polarity conflict -> the person, no adjudicator': {
			params: roundOf({ effort: 'medium', accepted: conflicted }),
			outcome: PERSON,
		},
		'low: a polarity conflict -> the person, no adjudicator': {
			params: roundOf({ effort: 'low', accepted: conflicted }),
			outcome: PERSON,
		},
	}

	it.each(Object.entries(rows))('%s', (_title, row) => {
		expect(roundOutcomeOf(row.params)).toMatchObject(row.outcome as object)
	})
})

describe('roundOutcomeOf: what an answered round agreed on (section 9)', () => {
	it('the verdict, the value, the shortest agreeing answer, the union of the agreeing readers verified cites and their letters', () => {
		const accepted = [
			documentAcceptedOf({ letter: 'A', answer: ANSWER_LONG, lines: LINES_FIRST }),
			documentAcceptedOf({
				letter: 'B',
				answer: ANSWER_SHORT,
				lines: LINES_SHARING,
				clause: CLAUSE_TWO,
			}),
		]

		expect(roundOutcomeOf(roundOf({ effort: 'medium', accepted }))).toEqual({
			state: 'answered',
			agreed: {
				verdict: 'yes',
				value: null,
				answer: ANSWER_SHORT,
				cites: [
					citeOf({ quote: QUOTE_D_POSITIVE, from: LINES_FIRST.from, to: LINES_FIRST.to }),
					citeOf({ quote: QUOTE_D_POSITIVE, from: LINES_SHARING.from, to: LINES_SHARING.to }),
				],
				letters: ['A', 'B'],
			},
		})
	})

	it('two readers citing the very same words -> one cite in the union, not two', () => {
		expect(roundOutcomeOf(roundOf({ effort: 'medium', accepted: AGREEING }))).toMatchObject({
			state: 'answered',
			agreed: {
				cites: [citeOf({ quote: QUOTE_D_POSITIVE, from: LINES_FIRST.from, to: LINES_FIRST.to })],
			},
		})
	})

	it('high with C at not-in-text -> only A and B are named, C kept out of the cites and the letters', () => {
		const accepted = [...AGREEING, documentAcceptedOf({ letter: 'C', verdict: 'not-in-text' })]

		expect(roundOutcomeOf(roundOf({ effort: 'high', accepted }))).toMatchObject({
			state: 'answered',
			agreed: { letters: ['A', 'B'] },
		})
	})

	it('a value report -> the agreed value is carried', () => {
		const accepted = [
			documentAcceptedOf({ letter: 'A', verdict: 'value', value: 'a, b' }),
			documentAcceptedOf({ letter: 'B', verdict: 'value', value: 'a, b' }),
		]

		expect(roundOutcomeOf(roundOf({ effort: 'low', accepted }))).toMatchObject({
			state: 'answered',
			agreed: { verdict: 'value', value: 'a, b' },
		})
	})
})
