/**
 * Review round 1, D43 (1): a person's fact holds the verdict `person`. A re-ask's agreed answer is compared with it as
 * different (shown to the person), never as a reader verdict the readers disagree with.
 */
import { reaskComparisonOf } from './reask-comparison-of.ts'

import { describe, expect, it } from 'vitest'

import type { FactAnswer } from '../facts/facts.types.ts'
import type { Agreed } from './ask.types.ts'

const AGREED_YES: Agreed = {
	verdict: 'yes',
	value: null,
	answer: 'AA_1 holds AAA_1.',
	cites: [],
	letters: ['A', 'B'],
}
const AGREED_VALUE: Agreed = { ...AGREED_YES, verdict: 'value', value: 'AAA_1' }

const PERSON_FACT: FactAnswer = { verdict: 'person', value: null, text: 'AA_1 holds AAA_1.' }
const PERSON_FACT_WITH_VALUE: FactAnswer = { verdict: 'person', value: 'AAA_1', text: 'AAA_1' }
const READER_FACT_YES: FactAnswer = { verdict: 'yes', value: null, text: 'It does.' }
const READER_FACT_NO: FactAnswer = { verdict: 'no', value: null, text: 'It does not.' }

const ROWS: Record<string, { current: FactAnswer; agreed: Agreed; expected: string }> = {
	'a person fact against readers agreeing yes -> shown': {
		current: PERSON_FACT,
		agreed: AGREED_YES,
		expected: 'shown',
	},
	'a person fact holding a value against readers agreeing that value -> shown': {
		current: PERSON_FACT_WITH_VALUE,
		agreed: AGREED_VALUE,
		expected: 'shown',
	},
	'a reader fact of yes against readers agreeing yes -> agrees': {
		current: READER_FACT_YES,
		agreed: AGREED_YES,
		expected: 'agrees',
	},
	'a reader fact of no against readers agreeing yes -> shown': {
		current: READER_FACT_NO,
		agreed: AGREED_YES,
		expected: 'shown',
	},
}

describe('reaskComparisonOf: a re-ask against the unchecked fact it would replace', () => {
	it.each(Object.entries(ROWS))('%s', (_title, row) => {
		expect(reaskComparisonOf({ current: row.current, agreed: row.agreed, kind: 'semantic' })).toBe(
			row.expected,
		)
	})
})
