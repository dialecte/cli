import {
	ANSWER_LONG,
	ANSWER_SHORT,
	DEFINITION_NO,
	DEFINITION_YES,
} from '../../../../test/ask-agreement-fixtures.constants.ts'
import { outsideAcceptedOf } from '../../../../test/ask-agreement-fixtures.ts'
import { outsideOutcomeOf } from './outside-outcome-of.ts'

import { describe, expect, it } from 'vitest'

import type { AcceptedReport, OutsideOutcomeOfParams } from './ask.types.ts'

/** The one round of outside readers of a case: medium, with no live definition answer, unless said. */
function outsideOf(
	params: Pick<OutsideOutcomeOfParams, 'accepted'> &
		Partial<Pick<OutsideOutcomeOfParams, 'effort' | 'definitionAnswer'>>,
): OutsideOutcomeOfParams {
	return { effort: 'medium', definitionAnswer: null, ...params }
}

const PERSON = { state: 'needs-person', reason: expect.stringMatching(/\S/u) }

const TWO_MODEL_READERS: AcceptedReport[] = [
	outsideAcceptedOf({ letter: 'A', source: 'model' }),
	outsideAcceptedOf({ letter: 'B', source: 'model' }),
]

const ROWS: Record<string, { params: OutsideOutcomeOfParams; outcome: unknown }> = {
	'two readers with the same verdict and value, none not-known -> answered (case 32i)': {
		params: outsideOf({ accepted: TWO_MODEL_READERS }),
		outcome: { state: 'answered' },
	},
	'one reader not-known (or hedged) -> the person (case 32h)': {
		params: outsideOf({
			accepted: [
				outsideAcceptedOf({ letter: 'A' }),
				outsideAcceptedOf({ letter: 'B', notKnown: true }),
			],
		}),
		outcome: PERSON,
	},
	'every reader not-known -> the person': {
		params: outsideOf({
			accepted: [
				outsideAcceptedOf({ letter: 'A', notKnown: true }),
				outsideAcceptedOf({ letter: 'B', notKnown: true }),
			],
		}),
		outcome: PERSON,
	},
	'two readers with different verdicts -> the person, no second round': {
		params: outsideOf({
			accepted: [
				outsideAcceptedOf({ letter: 'A', verdict: 'yes' }),
				outsideAcceptedOf({ letter: 'B', verdict: 'no' }),
			],
		}),
		outcome: PERSON,
	},
	'two readers with the same verdict and different values -> the person': {
		params: outsideOf({
			accepted: [
				outsideAcceptedOf({ letter: 'A', verdict: 'value', value: 'a' }),
				outsideAcceptedOf({ letter: 'B', verdict: 'value', value: 'b' }),
			],
		}),
		outcome: PERSON,
	},
	'high: three readers agree -> answered': {
		params: outsideOf({
			effort: 'high',
			accepted: [...TWO_MODEL_READERS, outsideAcceptedOf({ letter: 'C' })],
		}),
		outcome: { state: 'answered' },
	},
	'high: the third reader says no -> the person: every reader must agree, nothing outvotes it': {
		params: outsideOf({
			effort: 'high',
			accepted: [...TWO_MODEL_READERS, outsideAcceptedOf({ letter: 'C', verdict: 'no' })],
		}),
		outcome: PERSON,
	},
}

describe('outsideOutcomeOf: one round, every accepted reader agrees (section 18)', () => {
	it.each(Object.entries(ROWS))('%s', (_title, row) => {
		expect(outsideOutcomeOf(row.params)).toMatchObject(row.outcome as object)
	})

	it('answered -> the agreed verdict, value, the shortest answer, no document cite, the letters of the readers', () => {
		const accepted = [
			outsideAcceptedOf({ letter: 'A', answer: ANSWER_LONG }),
			outsideAcceptedOf({ letter: 'B', answer: ANSWER_SHORT }),
		]

		expect(outsideOutcomeOf(outsideOf({ accepted }))).toEqual({
			state: 'answered',
			agreed: { verdict: 'yes', value: null, answer: ANSWER_SHORT, cites: [], letters: ['A', 'B'] },
		})
	})
})

describe('outsideOutcomeOf: an outside agreement is held against the live definition answer (case 32r, D10)', () => {
	it('an agreement contradicting the definition answer -> the person, contradicts-definition', () => {
		expect(
			outsideOutcomeOf(outsideOf({ accepted: TWO_MODEL_READERS, definitionAnswer: DEFINITION_NO })),
		).toEqual({ state: 'needs-person', reason: 'contradicts-definition' })
	})

	it('an agreement that says what the definition answer says -> answered', () => {
		expect(
			outsideOutcomeOf(
				outsideOf({ accepted: TWO_MODEL_READERS, definitionAnswer: DEFINITION_YES }),
			),
		).toMatchObject({ state: 'answered' })
	})

	it('readers that disagree while the definition answers -> the person for the disagreement, not for the definition', () => {
		const accepted = [
			outsideAcceptedOf({ letter: 'A', verdict: 'yes' }),
			outsideAcceptedOf({ letter: 'B', verdict: 'no' }),
		]

		expect(outsideOutcomeOf(outsideOf({ accepted, definitionAnswer: DEFINITION_NO }))).toEqual({
			state: 'needs-person',
			reason: expect.not.stringMatching(/^contradicts-definition$/u),
		})
	})
})
