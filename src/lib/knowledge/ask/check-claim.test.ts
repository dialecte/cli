import { checkedClaimOf } from '../../../../test/ask-check-claim-helper.ts'
import {
	QUESTION_POSITIVE,
	REPORT_VOCABULARY,
	SUBJECT_TAG_D,
	GIVEN_DIRECT_ABOUT_D,
	QUOTE_ABOUT_AA,
	QUOTE_ABOUT_DD,
	QUOTE_D_POSITIVE,
	QUOTE_NAMING_CODE,
	QUOTE_NAMING_NOTHING,
	QUOTE_WITHOUT_DD,
	SUBJECT_CODE_ONLY,
} from '../../../../test/ask-report-fixtures.constants.ts'
import { citeOf, verifiedCiteOf } from '../../../../test/ask-report-fixtures.ts'
import { checkClaim } from './check-claim.ts'

import { describe, expect, it } from 'vitest'

import type { ClaimRow } from '../../../../test/ask-check-claim-helper.types.ts'

const ACCEPTED = { verified: true, refused: null, polarityConflict: false }

describe('checkClaim: the key terms, the subject and the verdict (cases 20 to 23d)', () => {
	const rows: Record<string, ClaimRow> = {
		'a claim that holds a key term, backed by a quote naming the subject -> verified': {
			case: { text: 'D shall hold DD_1', quote: QUOTE_D_POSITIVE },
			expected: ACCEPTED,
		},
		'20: a claim with no key term, behind a valid 8-word quote -> no-key-term': {
			case: { text: 'the thing is present in its place', quote: QUOTE_D_POSITIVE },
			expected: { verified: false, refused: 'no-key-term' },
		},
		'21: a key term the quote does not hold -> term-missing naming that term': {
			case: { text: 'D shall hold DD_1', quote: QUOTE_WITHOUT_DD },
			expected: { verified: false, refused: 'term-missing:DD_1' },
		},
		'a missing key term is reported before a claim that backs another verdict': {
			case: { text: 'D shall hold DD_1', quote: QUOTE_WITHOUT_DD, supports: 'no' },
			expected: { verified: false, refused: 'term-missing:DD_1' },
		},
		'22: a quote about another tag, no subject tag in the quote or the clause title -> off-subject':
			{
				case: { text: 'AA_1 shall hold DD_1', quote: QUOTE_ABOUT_AA },
				expected: { verified: false, refused: 'off-subject' },
			},
		'22: the same quote under a clause title naming the subject tag -> verified': {
			case: { text: 'AA_1 shall hold DD_1', quote: QUOTE_ABOUT_AA, slice: GIVEN_DIRECT_ABOUT_D },
			expected: ACCEPTED,
		},
		'22: the subject tag D is word-bounded, a quote naming only DD_1 does not name it -> off-subject':
			{
				case: { text: 'DD_1 shall hold AA_1', quote: QUOTE_ABOUT_DD },
				expected: { verified: false, refused: 'off-subject' },
			},
		'23d: an ask with no subject tag, a quote naming none of the subject terms -> off-subject': {
			case: { text: 'DD_1 shall hold', quote: QUOTE_NAMING_NOTHING, subject: SUBJECT_CODE_ONLY },
			expected: { verified: false, refused: 'off-subject' },
		},
		'23d: an ask with no subject tag, a quote naming the code -> verified': {
			case: { text: 'DD_1 shall hold', quote: QUOTE_NAMING_CODE, subject: SUBJECT_CODE_ONLY },
			expected: ACCEPTED,
		},
		'a claim that backs another verdict than the report -> does-not-support': {
			case: { text: 'D shall hold DD_1', quote: QUOTE_D_POSITIVE, supports: 'no', verdict: 'yes' },
			expected: { verified: false, refused: 'does-not-support' },
		},
	}

	for (const [name, row] of Object.entries(rows))
		it(`${name}`, () => {
			expect(checkedClaimOf(row.case)).toMatchObject(row.expected)
		})
})

describe('checkClaim: only verified cites count', () => {
	it('a refused cite holding the key term and a verified cite without it -> term-missing', () => {
		const refusedCite = citeOf({ quote: QUOTE_D_POSITIVE, from: 50, to: 51 })
		const verifiedCite = citeOf({ quote: QUOTE_WITHOUT_DD })
		expect(
			checkClaim({
				claim: {
					text: 'D shall hold DD_1',
					supports: 'yes',
					cites: [refusedCite, verifiedCite],
				},
				cites: [
					{ cite: refusedCite, verified: false, refused: 'not-given' },
					verifiedCiteOf({ cite: verifiedCite }),
				],
				verdict: 'yes',
				question: QUESTION_POSITIVE,
				subject: SUBJECT_TAG_D,
				vocabulary: REPORT_VOCABULARY,
			}),
		).toMatchObject({ verified: false, refused: 'term-missing:DD_1' })
	})
})
