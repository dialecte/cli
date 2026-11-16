/**
 * Review round 1, R1-2: an outside agreement holds no polarity conflict. Any accepted report whose claim contradicts
 * the question's wording sends the ask to the person; no adjudicator reads outside answers.
 */
import { outsideAcceptedOf } from '../../../../test/ask-agreement-fixtures.ts'
import { outsideOutcomeOf } from './outside-outcome-of.ts'

import { describe, expect, it } from 'vitest'

import type { AcceptedReport, OutsideOutcomeOfParams } from './ask.types.ts'

const PERSON = { state: 'needs-person', reason: expect.stringMatching(/\S/u) }

/** Two readers that agree on every word of their answer, the second one's claim contradicting the question. */
const ONE_CONFLICT: AcceptedReport[] = [
	outsideAcceptedOf({ letter: 'A' }),
	outsideAcceptedOf({ letter: 'B', polarityConflict: true }),
]

const ROWS: Record<string, OutsideOutcomeOfParams> = {
	'medium: two readers agree, one claim contradicts the question -> the person': {
		effort: 'medium',
		accepted: ONE_CONFLICT,
		definitionAnswer: null,
	},
	'high: three readers agree, one claim contradicts the question -> the person, never an adjudicator':
		{
			effort: 'high',
			accepted: [...ONE_CONFLICT, outsideAcceptedOf({ letter: 'C' })],
			definitionAnswer: null,
		},
	'low: both readers agree and both claims contradict the question -> the person': {
		effort: 'low',
		accepted: [
			outsideAcceptedOf({ letter: 'A', polarityConflict: true }),
			outsideAcceptedOf({ letter: 'B', polarityConflict: true }),
		],
		definitionAnswer: null,
	},
}

describe('outsideOutcomeOf: a polarity conflict never counts toward an outside agreement', () => {
	it.each(Object.entries(ROWS))('%s', (_title, params) => {
		expect(outsideOutcomeOf(params)).toMatchObject(PERSON)
	})
})
