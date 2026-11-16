/**
 * Review round 1, R1-3: a dissent or a disagreement with nothing left to give never asks for another round: it goes
 * to the adjudicator at high, else to the person.
 */
import { documentAcceptedOf } from '../../../../test/ask-agreement-fixtures.ts'
import { roundOutcomeOf } from './round-outcome-of.ts'

import { describe, expect, it } from 'vitest'

import type { AcceptedReport, RoundOutcomeOfParams } from './ask.types.ts'

/** The closed round of a case: round 1 with nothing left to give, unless said. */
function roundWithNothingLeft(
	params: Pick<RoundOutcomeOfParams, 'effort' | 'accepted'> &
		Partial<Pick<RoundOutcomeOfParams, 'round'>>,
): RoundOutcomeOfParams {
	return { round: 1, anythingLeft: false, outside: false, ...params }
}

const AGREEING: AcceptedReport[] = [
	documentAcceptedOf({ letter: 'A' }),
	documentAcceptedOf({ letter: 'B' }),
]
const DISAGREEING: AcceptedReport[] = [
	documentAcceptedOf({ letter: 'A', verdict: 'yes' }),
	documentAcceptedOf({ letter: 'B', verdict: 'no' }),
]
const ONE_DISSENT: AcceptedReport[] = [
	...AGREEING,
	documentAcceptedOf({ letter: 'C', verdict: 'no' }),
]
const THREE_WAYS: AcceptedReport[] = [
	documentAcceptedOf({ letter: 'A', verdict: 'yes' }),
	documentAcceptedOf({ letter: 'B', verdict: 'no' }),
	documentAcceptedOf({ letter: 'C', verdict: 'depends', value: 'a condition' }),
]

const PERSON = { state: 'needs-person', reason: expect.stringMatching(/\S/u) }
const ADJUDICATOR = { state: 'needs-adjudicator', reason: 'no-agreement' }

const ROWS: Record<string, { params: RoundOutcomeOfParams; outcome: unknown }> = {
	'medium: A and B disagree in the first round, nothing left to give -> the person': {
		params: roundWithNothingLeft({ effort: 'medium', accepted: DISAGREEING }),
		outcome: PERSON,
	},
	'medium: only A answers in the first round, nothing left to give -> the person': {
		params: roundWithNothingLeft({
			effort: 'medium',
			accepted: [
				documentAcceptedOf({ letter: 'A' }),
				documentAcceptedOf({ letter: 'B', verdict: 'not-in-text' }),
			],
		}),
		outcome: PERSON,
	},
	'high: A and B agree and C dissents in the first round, nothing left to give -> the adjudicator':
		{
			params: roundWithNothingLeft({ effort: 'high', accepted: ONE_DISSENT }),
			outcome: ADJUDICATOR,
		},
	'high: A, B and C all differ in the second round, nothing left to give -> the adjudicator': {
		params: roundWithNothingLeft({ effort: 'high', round: 2, accepted: THREE_WAYS }),
		outcome: ADJUDICATOR,
	},
	'high: A and B disagree in the first round, nothing left to give -> the adjudicator': {
		params: roundWithNothingLeft({ effort: 'high', accepted: DISAGREEING }),
		outcome: ADJUDICATOR,
	},
}

describe('roundOutcomeOf: nothing left to give closes a round that did not agree', () => {
	it.each(Object.entries(ROWS))('%s', (_title, row) => {
		expect(roundOutcomeOf(row.params)).toMatchObject(row.outcome as object)
	})
})
