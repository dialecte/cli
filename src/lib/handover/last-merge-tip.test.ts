import { lastMergeTipOf } from './last-merge-tip.ts'

import { describe, expect, it } from 'vitest'

import type { MergeLot, ResolvedLot } from './handover.types.ts'

type TestCase = {
	lots: ResolvedLot[]
	expected: string | undefined
	only?: boolean
}

function plainLot(message: string): ResolvedLot {
	return { message, files: [], deletedFiles: [] }
}

function mergeLot(params: { message: string; tip: string }): ResolvedLot {
	const merge: MergeLot = {
		branch: 'main',
		tip: params.tip,
		onTree: 'a'.repeat(40),
		conflicts: [],
		resolutions: [],
	}
	return { ...plainLot(params.message), merge }
}

describe('lastMergeTipOf', () => {
	const testCases: Record<string, TestCase> = {
		'no lot merges → undefined': {
			lots: [plainLot('feat: first'), plainLot('feat: second')],
			expected: undefined,
		},
		'no lot at all → undefined': { lots: [], expected: undefined },
		'one merge lot → its tip': {
			lots: [mergeLot({ message: 'merge: main', tip: 'b'.repeat(40) })],
			expected: 'b'.repeat(40),
		},
		'two merge lots → the second one tip': {
			lots: [
				mergeLot({ message: 'merge: one', tip: 'b'.repeat(40) }),
				mergeLot({ message: 'merge: two', tip: 'c'.repeat(40) }),
			],
			expected: 'c'.repeat(40),
		},
		'a merge lot then a plain lot → the merge lot tip': {
			lots: [mergeLot({ message: 'merge: main', tip: 'b'.repeat(40) }), plainLot('feat: after')],
			expected: 'b'.repeat(40),
		},
	}

	for (const [title, testCase] of Object.entries(testCases)) {
		;(testCase.only ? it.only : it)(title, () => {
			expect(lastMergeTipOf(testCase.lots)).toBe(testCase.expected)
		})
	}
})
