import { normaliseText } from './normalise-text.ts'

import { describe, expect, it } from 'vitest'

type TestCase = {
	input: string
	expected: string
}

describe('normaliseText', () => {
	const testCases: Record<string, TestCase> = {
		'a fi ligature → two letters': { input: 'conﬁgure', expected: 'configure' },
		'a fl ligature → two letters': { input: 'the ﬂow', expected: 'the flow' },
		'an ffi ligature → three letters': { input: 'oﬃce', expected: 'office' },
		'a non-breaking space → a space': { input: 'a b', expected: 'a b' },
		'a narrow non-breaking space → a space': { input: 'a b', expected: 'a b' },
		'a thin space → a space': { input: 'a b', expected: 'a b' },
		'an em space → a space': { input: 'a b', expected: 'a b' },
		'an en dash → a hyphen': { input: '1–5', expected: '1-5' },
		'an em dash → a hyphen': { input: 'so—so', expected: 'so-so' },
		'a minus sign → a hyphen': { input: '−1', expected: '-1' },
		'a figure dash → a hyphen': { input: '4‒5', expected: '4-5' },
		'a soft hyphen → removed': { input: 'co­operate', expected: 'cooperate' },
		'a plain hyphen → kept': { input: 'well-known', expected: 'well-known' },
		'curly single quotes → straight quotes': {
			input: '‘a’ and don’t',
			expected: "'a' and don't",
		},
		'curly double quotes → straight quotes': {
			input: '“b”',
			expected: '"b"',
		},
		'runs of spaces, tabs and line breaks → one space': {
			input: 'a   b\t\tc\n d',
			expected: 'a b c d',
		},
		'leading and trailing whitespace → trimmed': { input: '  a b   ', expected: 'a b' },
		'an empty text → empty': { input: '', expected: '' },
		'whitespace only → empty': { input: ' \t  ', expected: '' },
		'text with nothing to fold → unchanged': {
			input: 'Plain text, 12 items.',
			expected: 'Plain text, 12 items.',
		},
		'several folds in one text → every one applied': {
			input: 'The “ﬁle” is—ok',
			expected: 'The "file" is-ok',
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			expect(normaliseText(testCase.input)).toBe(testCase.expected)
		})
})
