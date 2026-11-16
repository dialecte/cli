import { checkCodeRules } from './check-code-rules.ts'
import { GENERIC_REFERENCE_PATTERNS } from './committed-text.constants.ts'

import { describe, expect, it } from 'vitest'

type TestCase = {
	/** The second argument of `Object.setPrototypeOf(this, …)` in a data-only error's constructor. */
	prototype: string
	expected: { refused: boolean }
	only?: boolean
}

function refusedWith(prototype: string): { refused: boolean } {
	const text = [
		'class Refusal extends Error {',
		'\tconstructor() {',
		"\t\tsuper('refused')",
		`\t\tObject.setPrototypeOf(this, ${prototype})`,
		'\t}',
		'}',
		'',
	].join('\n')
	return {
		refused: checkCodeRules({
			file: 'src/lib/read-things.ts',
			text,
			referencePatterns: GENERIC_REFERENCE_PATTERNS,
		}).some((finding) => finding.rule === 'class'),
	}
}

describe('checkCodeRules: Object.setPrototypeOf(this, …) in a data-only error', () => {
	const testCases: Record<string, TestCase> = {
		'<Name>.prototype → admitted': {
			prototype: 'Refusal.prototype',
			expected: { refused: false },
		},
		'new.target.prototype → admitted': {
			prototype: 'new.target.prototype',
			expected: { refused: false },
		},
		'a call → refused': { prototype: 'make()', expected: { refused: true } },
		'a bare name → refused': { prototype: 'other', expected: { refused: true } },
		'a prototype read through a call → refused': {
			prototype: 'make().prototype',
			expected: { refused: true },
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		(testCase.only ? it.only : it)(title, () => {
			expect(refusedWith(testCase.prototype)).toEqual(testCase.expected)
		})
})
