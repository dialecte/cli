import { GENERIC_NOUNS } from '../host/host.constants.ts'
import { FILLED_PARTS, KEPT_PART } from './change-request.constants.ts'
/**
 * The review part of a pull request names the lot's design first (DESIGN-GATE section 4): its state and who approved
 * or waived it, by kind only; never a name, a path, a hash or a reason; no line for a lot whose record holds no design.
 */
import { composeChangeRequest } from './compose-change-request.ts'

import { describe, expect, it } from 'vitest'

import type { ReviewRecord } from '../review-rounds/review-record.types.ts'

/** A template holding every part the renderer fills, then the kept part. */
const TEMPLATE = [...FILLED_PARTS, KEPT_PART]
	.map((part) => `### ${part}\n\n<!-- dialecte:${part} -->\n`)
	.join('\n')

/** The review part of the body a record renders. */
function reviewPartOf(review: ReviewRecord): string {
	const text = composeChangeRequest({
		template: TEMPLATE,
		nouns: GENERIC_NOUNS,
		sources: {
			messages: [],
			treeHash: 'a'.repeat(64),
			review,
			release: false,
		},
		kept: undefined,
	})
	if ('refusal' in text) throw new Error(text.refusal)
	return text.body.split('### review\n\n')[1].split('\n### ')[0]
}

type DesignCase = { name: string; review: ReviewRecord; expected: string }

const cases: DesignCase[] = [
	{
		name: "a person's approval -> Design: approved by person, never the name",
		review: {
			findings: [],
			verdicts: [],
			design: {
				schema: 1,
				kind: 'design',
				state: 'approved',
				by: { kind: 'person', name: 'person-a' },
			},
		},
		expected: 'Design: approved by person\nNo finding.\n',
	},
	{
		name: "the orchestrator's approval -> Design: approved by orchestrator",
		review: {
			findings: [],
			verdicts: [],
			design: {
				schema: 1,
				kind: 'design',
				state: 'approved',
				by: { kind: 'person', name: 'orchestrator' },
			},
		},
		expected: 'Design: approved by orchestrator\nNo finding.\n',
	},
	{
		name: 'a waiver -> Design: waived by person',
		review: {
			findings: [],
			verdicts: [],
			design: {
				schema: 1,
				kind: 'design',
				state: 'waived',
				by: { kind: 'person', name: 'person-a' },
			},
		},
		expected: 'Design: waived by person\nNo finding.\n',
	},
	{
		name: 'a design not approved yet, nobody named -> Design: not approved',
		review: {
			findings: [],
			verdicts: [],
			design: { schema: 1, kind: 'design', state: 'unapproved' },
		},
		expected: 'Design: not approved\nNo finding.\n',
	},
	{
		name: 'a record with no design -> no Design line',
		review: { findings: [], verdicts: [] },
		expected: 'No finding.\n',
	},
]

describe('the review part, the design line', () => {
	it.each(cases)('$name', ({ review, expected }) => {
		expect(reviewPartOf(review)).toBe(expected)
	})
})
