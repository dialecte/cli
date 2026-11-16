import { checkedClaimOf } from '../../../../test/ask-check-claim-helper.ts'
import {
	QUESTION_NEGATIVE,
	QUOTE_D_EXCEPTION_FAR,
	QUOTE_D_EXCEPT,
	QUOTE_D_MUST_NOT,
	QUOTE_D_NEGATION_FAR,
	QUOTE_D_ONLY,
	QUOTE_D_OTHER_THAN,
	QUOTE_D_POSITIVE,
	QUOTE_D_SHALL_NOT,
	QUOTE_D_UNLESS,
} from '../../../../test/ask-report-fixtures.constants.ts'

import { describe, expect, it } from 'vitest'

import type { ClaimRow } from '../../../../test/ask-check-claim-helper.types.ts'

const CONFLICT = { polarityConflict: true }
const NO_CONFLICT = { polarityConflict: false }

describe('checkClaim: quote against claim, negation cues within 8 words of the subject (case 23)', () => {
	const rows: Record<string, ClaimRow> = {
		'neither negates -> no conflict': {
			case: { text: 'D shall hold DD_1', quote: QUOTE_D_POSITIVE },
			expected: NO_CONFLICT,
		},
		'the quote negates (shall not), the claim does not -> conflict': {
			case: { text: 'D shall hold DD_1', quote: QUOTE_D_SHALL_NOT },
			expected: CONFLICT,
		},
		'the claim negates, the quote does not -> conflict': {
			case: {
				text: 'D shall not hold DD_1',
				quote: QUOTE_D_POSITIVE,
				supports: 'no',
				verdict: 'no',
			},
			expected: CONFLICT,
		},
		'the quote and the claim both negate with shall not: the same parity -> no conflict': {
			case: {
				text: 'D shall not hold DD_1',
				quote: QUOTE_D_SHALL_NOT,
				supports: 'no',
				verdict: 'no',
			},
			expected: NO_CONFLICT,
		},
		'must not in the quote is one cue, never in the claim is one cue: not counted twice -> no conflict':
			{
				case: {
					text: 'D never holds DD_1',
					quote: QUOTE_D_MUST_NOT,
					supports: 'no',
					verdict: 'no',
				},
				expected: NO_CONFLICT,
			},
		'a negation more than 8 words from the subject is not counted -> no conflict': {
			case: { text: 'D shall hold DD_1', quote: QUOTE_D_NEGATION_FAR },
			expected: NO_CONFLICT,
		},
	}

	for (const [name, row] of Object.entries(rows))
		it(`${name}`, () => {
			expect(checkedClaimOf(row.case)).toMatchObject(row.expected)
		})
})

describe('checkClaim: claim against verdict, under the question wording (case 23b)', () => {
	const rows: Record<string, ClaimRow> = {
		'positive question, a negating quote and claim, supports yes -> conflict': {
			case: {
				text: 'D shall not hold DD_1',
				quote: QUOTE_D_SHALL_NOT,
				supports: 'yes',
				verdict: 'yes',
			},
			expected: CONFLICT,
		},
		'negative question (never), the same negating claim, supports yes -> no conflict': {
			case: {
				text: 'D shall not hold DD_1',
				quote: QUOTE_D_SHALL_NOT,
				supports: 'yes',
				verdict: 'yes',
				question: QUESTION_NEGATIVE,
			},
			expected: NO_CONFLICT,
		},
		'positive question, a negating quote and claim, supports no -> no conflict': {
			case: {
				text: 'D shall not hold DD_1',
				quote: QUOTE_D_SHALL_NOT,
				supports: 'no',
				verdict: 'no',
			},
			expected: NO_CONFLICT,
		},
		'positive question, a plain claim, supports no -> conflict, whatever the quote says': {
			case: { text: 'D shall hold DD_1', quote: QUOTE_D_POSITIVE, supports: 'no', verdict: 'no' },
			expected: CONFLICT,
		},
	}

	for (const [name, row] of Object.entries(rows))
		it(`${name}`, () => {
			expect(checkedClaimOf(row.case)).toMatchObject(row.expected)
		})
})

describe('checkClaim: exception cues near the subject are never cancelled by a negation (case 23c)', () => {
	const rows: Record<string, ClaimRow> = {
		'not and except near the subject, the claim negating like the quote -> conflict': {
			case: { text: 'D shall not hold DD_1', quote: QUOTE_D_EXCEPT, supports: 'no', verdict: 'no' },
			expected: CONFLICT,
		},
		'the same quote under a depends verdict and claim -> no conflict': {
			case: {
				text: 'D shall not hold DD_1',
				quote: QUOTE_D_EXCEPT,
				supports: 'depends',
				verdict: 'depends',
				value: 'a condition',
			},
			expected: NO_CONFLICT,
		},
		'an exception cue more than 8 words from the subject is not counted -> no conflict': {
			case: { text: 'D shall hold DD_1', quote: QUOTE_D_EXCEPTION_FAR },
			expected: NO_CONFLICT,
		},
		'unless near the subject -> conflict': {
			case: { text: 'D shall hold DD_1', quote: QUOTE_D_UNLESS },
			expected: CONFLICT,
		},
		'unless near the subject under a depends verdict -> no conflict': {
			case: {
				text: 'D shall hold DD_1',
				quote: QUOTE_D_UNLESS,
				supports: 'depends',
				verdict: 'depends',
				value: 'a condition',
			},
			expected: NO_CONFLICT,
		},
		'only near the subject -> conflict': {
			case: { text: 'D shall hold DD_1', quote: QUOTE_D_ONLY },
			expected: CONFLICT,
		},
		'other than near the subject -> conflict': {
			case: { text: 'D shall hold DD_1', quote: QUOTE_D_OTHER_THAN },
			expected: CONFLICT,
		},
	}

	for (const [name, row] of Object.entries(rows))
		it(`${name}`, () => {
			expect(checkedClaimOf(row.case)).toMatchObject(row.expected)
		})
})
