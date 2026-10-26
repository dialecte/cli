import { parseIntentText } from './discover.ts'

import { describe, expect, it } from 'vitest'

describe('parseIntentText', () => {
	const testCases = {
		'comma-separated phrases → one intent each, trimmed': {
			text: 'read a subtree, walk children recursively ',
			expected: ['read a subtree', 'walk children recursively'],
		},
		'a phrase wrapped on the next line → kept whole': {
			text: 'read a subtree in document\n order, walk children',
			expected: ['read a subtree in document order', 'walk children'],
		},
		'commas inside parentheses → part of the phrase': {
			text: 'state of an LNode or signal (locked, mapped, connected), number a taken name (_1, _2)',
			expected: [
				'state of an LNode or signal (locked, mapped, connected)',
				'number a taken name (_1, _2)',
			],
		},
		'the tag followed by more description → the description is not an intent': {
			text: 'count what a document is made of\n\n`findDescendants` answers with the records',
			expected: ['count what a document is made of'],
		},
	}

	for (const [title, testCase] of Object.entries(testCases)) {
		it(title, () => {
			expect(parseIntentText(testCase.text)).toEqual(testCase.expected)
		})
	}
})
