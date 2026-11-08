import { indexSynthetic } from '../../../../test/index-synthetic-standard.ts'
import { DOT_LEADER } from '../../../../test/synthetic-standard.constants.ts'
import { captionLine } from '../../../../test/synthetic-standard.ts'

import { describe, expect, it } from 'vitest'

import type { SyntheticBlock } from '../../../../test/synthetic-standard.types.ts'
import type { StandardFileIndex, StandardLogicalLine } from './standard-index.types.ts'

type TestCase = {
	blocks: SyntheticBlock[]
	expected: StandardLogicalLine[]
}

function raw(...lines: string[]): SyntheticBlock {
	return { kind: 'raw', lines }
}

function logicalLinesOf(index: StandardFileIndex): StandardLogicalLine[] {
	return index.logicalLines
}

describe('join: prose lines into logical lines', () => {
	const testCases: Record<string, TestCase> = {
		'three consecutive prose lines → one logical line keeping the first and last line': {
			blocks: [raw('First part of a sentence', 'second part continues', 'and the end.')],
			expected: [
				{
					from: 1,
					to: 3,
					kind: 'prose',
					text: 'First part of a sentence second part continues and the end.',
				},
			],
		},
		'a blank line between prose lines → two logical lines': {
			blocks: [raw('First paragraph.', '', 'Second paragraph.')],
			expected: [
				{ from: 1, to: 1, kind: 'prose', text: 'First paragraph.' },
				{ from: 3, to: 3, kind: 'prose', text: 'Second paragraph.' },
			],
		},
		'prose lines with indentation and trailing spaces → joined with one space': {
			blocks: [raw('  Alpha   beta  ', 'gamma')],
			expected: [{ from: 1, to: 2, kind: 'prose', text: 'Alpha beta gamma' }],
		},
		'a table line between prose lines → three logical lines': {
			blocks: [raw('Before text.', '| a | b |', 'After text.')],
			expected: [
				{ from: 1, to: 1, kind: 'prose', text: 'Before text.' },
				{ from: 2, to: 2, kind: 'table', text: '| a | b |' },
				{ from: 3, to: 3, kind: 'prose', text: 'After text.' },
			],
		},
		'a code line between prose lines → three logical lines': {
			blocks: [raw('Before text.', '<D a="1"/>', 'After text.')],
			expected: [
				{ from: 1, to: 1, kind: 'prose', text: 'Before text.' },
				{ from: 2, to: 2, kind: 'code', text: '<D a="1"/>' },
				{ from: 3, to: 3, kind: 'prose', text: 'After text.' },
			],
		},
		'a fenced block between prose lines → prose, the fence lines one by one, prose': {
			blocks: [raw('Before text.'), { kind: 'fence', lines: ['code words'] }, raw('After text.')],
			expected: [
				{ from: 1, to: 1, kind: 'prose', text: 'Before text.' },
				{ from: 2, to: 2, kind: 'code', text: '```' },
				{ from: 3, to: 3, kind: 'code', text: 'code words' },
				{ from: 4, to: 4, kind: 'code', text: '```' },
				{ from: 5, to: 5, kind: 'prose', text: 'After text.' },
			],
		},
		'a toc line between prose lines → three logical lines': {
			blocks: [
				raw('Before text.'),
				{ kind: 'tocEntry', number: '1', title: 'Scope', page: '4' },
				raw('After text.'),
			],
			expected: [
				{ from: 1, to: 1, kind: 'prose', text: 'Before text.' },
				{ from: 2, to: 2, kind: 'toc', text: `1 Scope ${DOT_LEADER} 4` },
				{ from: 3, to: 3, kind: 'prose', text: 'After text.' },
			],
		},
		'a heading with a non-blank line right before and after it → a heading, ending the paragraph': {
			blocks: [
				raw('Intro sentence.'),
				{ kind: 'heading', number: '1', title: 'Scope' },
				raw('Body sentence.'),
			],
			expected: [
				{ from: 1, to: 1, kind: 'prose', text: 'Intro sentence.' },
				{ from: 2, to: 2, kind: 'heading', text: '1 Scope' },
				{ from: 3, to: 3, kind: 'prose', text: 'Body sentence.' },
			],
		},
		'a definition line between prose lines inside the terms clause → three logical lines': {
			blocks: [
				{ kind: 'heading', number: '1', title: 'Terms and definitions' },
				raw('Intro text.'),
				{ kind: 'definition', number: '1.1', term: 'Alpha node', layout: 'inline' },
				raw('Describes alpha.'),
			],
			expected: [
				{ from: 1, to: 1, kind: 'heading', text: '1 Terms and definitions' },
				{ from: 2, to: 2, kind: 'prose', text: 'Intro text.' },
				{ from: 3, to: 3, kind: 'definition', text: '1.1 Alpha node' },
				{ from: 4, to: 4, kind: 'prose', text: 'Describes alpha.' },
			],
		},
		'a caption line between prose lines → three logical lines': {
			blocks: [
				raw('Before text.'),
				{ kind: 'caption', word: 'table', number: '1', title: 'Sample values' },
				raw('After text.'),
			],
			expected: [
				{ from: 1, to: 1, kind: 'prose', text: 'Before text.' },
				{
					from: 2,
					to: 2,
					kind: 'caption',
					text: captionLine({ word: 'table', number: '1', title: 'Sample values' }),
				},
				{ from: 3, to: 3, kind: 'prose', text: 'After text.' },
			],
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			expect(logicalLinesOf(indexSynthetic({ blocks: testCase.blocks }))).toEqual(testCase.expected)
		})
})

describe('join: a word split across lines, folded characters', () => {
	const testCases: Record<string, TestCase> = {
		'a word split across two lines → joined without hyphen and space': {
			blocks: [raw('The configura-', 'tion of the node.')],
			expected: [{ from: 1, to: 2, kind: 'prose', text: 'The configuration of the node.' }],
		},
		'a word split across three lines → joined twice': {
			blocks: [raw('Inter-', 'national stand-', 'ards apply.')],
			expected: [{ from: 1, to: 3, kind: 'prose', text: 'International standards apply.' }],
		},
		'a hyphen before a line starting in upper case → kept, joined with a space': {
			blocks: [raw('Pre-', 'Fixed text.')],
			expected: [{ from: 1, to: 2, kind: 'prose', text: 'Pre- Fixed text.' }],
		},
		'a hyphen before a line starting with a digit → kept, joined with a space': {
			blocks: [raw('Pre-', '3 more words.')],
			expected: [{ from: 1, to: 2, kind: 'prose', text: 'Pre- 3 more words.' }],
		},
		'a hyphen after a digit before a lower-case line → kept, joined with a space': {
			blocks: [raw('Range 1-', 'and so on.')],
			expected: [{ from: 1, to: 2, kind: 'prose', text: 'Range 1- and so on.' }],
		},
		'a hyphen at the end of a paragraph → kept, the next paragraph apart': {
			blocks: [raw('Word-', '', 'next paragraph.')],
			expected: [
				{ from: 1, to: 1, kind: 'prose', text: 'Word-' },
				{ from: 3, to: 3, kind: 'prose', text: 'next paragraph.' },
			],
		},
		'ligature words in a line → folded in the logical text': {
			blocks: [raw('The conﬁguration of the ﬁle.')],
			expected: [{ from: 1, to: 1, kind: 'prose', text: 'The configuration of the file.' }],
		},
		'a ligature word split across lines → folded and joined': {
			blocks: [raw('The conﬁgura-', 'tion.')],
			expected: [{ from: 1, to: 2, kind: 'prose', text: 'The configuration.' }],
		},
		'an en dash and a non-breaking space in a line → folded in the logical text': {
			blocks: [raw('Range 1–5 and more.')],
			expected: [{ from: 1, to: 1, kind: 'prose', text: 'Range 1-5 and more.' }],
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			expect(logicalLinesOf(indexSynthetic({ blocks: testCase.blocks }))).toEqual(testCase.expected)
		})
})

describe('join: letter-spaced prose', () => {
	const testCases: Record<string, TestCase> = {
		'letters spaced out, words by two spaces → rebuilt words': {
			blocks: [{ kind: 'letterSpaced', text: 'The quick brown fox' }],
			expected: [{ from: 1, to: 1, kind: 'prose', text: 'The quick brown fox' }],
		},
		'4 one-character tokens with no wide gap → all spaces removed': {
			blocks: [raw('a b c d')],
			expected: [{ from: 1, to: 1, kind: 'prose', text: 'abcd' }],
		},
		'5 tokens, 4 of them one character (80 %) → rebuilt': {
			blocks: [raw('a b c d word')],
			expected: [{ from: 1, to: 1, kind: 'prose', text: 'abcdword' }],
		},
		'4 tokens, 3 of them one character (75 %) → left as written': {
			blocks: [raw('a b c word')],
			expected: [{ from: 1, to: 1, kind: 'prose', text: 'a b c word' }],
		},
		'3 one-character tokens → left as written': {
			blocks: [raw('a b c')],
			expected: [{ from: 1, to: 1, kind: 'prose', text: 'a b c' }],
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			expect(logicalLinesOf(indexSynthetic({ blocks: testCase.blocks }))).toEqual(testCase.expected)
		})
})

describe('join: heading candidates left out by the sequence become prose', () => {
	const testCases: Record<string, TestCase> = {
		'a stray number before the real headings, isolated by blank lines → a prose logical line': {
			blocks: [
				raw('7  Stray title', ''),
				{ kind: 'heading', number: '1', title: 'Alpha' },
				{ kind: 'heading', number: '2', title: 'Beta' },
				{ kind: 'heading', number: '3', title: 'Gamma' },
			],
			expected: [
				{ from: 1, to: 1, kind: 'prose', text: '7 Stray title' },
				{ from: 3, to: 3, kind: 'heading', text: '1 Alpha' },
				{ from: 4, to: 4, kind: 'heading', text: '2 Beta' },
				{ from: 5, to: 5, kind: 'heading', text: '3 Gamma' },
			],
		},
		'a stray number between two prose lines → joined with them like any prose line': {
			blocks: [
				raw('Before text.', '7  Stray title', 'After text.', ''),
				{ kind: 'heading', number: '1', title: 'Alpha' },
				{ kind: 'heading', number: '2', title: 'Beta' },
				{ kind: 'heading', number: '3', title: 'Gamma' },
			],
			expected: [
				{ from: 1, to: 3, kind: 'prose', text: 'Before text. 7 Stray title After text.' },
				{ from: 5, to: 5, kind: 'heading', text: '1 Alpha' },
				{ from: 6, to: 6, kind: 'heading', text: '2 Beta' },
				{ from: 7, to: 7, kind: 'heading', text: '3 Gamma' },
			],
		},
		'a duplicate number isolated by blank lines → a prose logical line, the first kept': {
			blocks: [
				{ kind: 'heading', number: '1', title: 'Alpha' },
				{ kind: 'heading', number: '1.1', title: 'Beta' },
				raw(''),
				{ kind: 'heading', number: '1.1', title: 'Beta again' },
				raw(''),
				{ kind: 'heading', number: '1.2', title: 'Gamma' },
			],
			expected: [
				{ from: 1, to: 1, kind: 'heading', text: '1 Alpha' },
				{ from: 2, to: 2, kind: 'heading', text: '1.1 Beta' },
				{ from: 4, to: 4, kind: 'prose', text: '1.1 Beta again' },
				{ from: 6, to: 6, kind: 'heading', text: '1.2 Gamma' },
			],
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			expect(logicalLinesOf(indexSynthetic({ blocks: testCase.blocks }))).toEqual(testCase.expected)
		})
})

describe('join: leading markdown markers are not part of the text', () => {
	const testCases: Record<string, TestCase> = {
		'a heading behind hash markers → text without them': {
			blocks: [raw('## 1  Scope')],
			expected: [{ from: 1, to: 1, kind: 'heading', text: '1 Scope' }],
		},
		'a heading behind a quote marker → text without it': {
			blocks: [raw('> 1  Scope')],
			expected: [{ from: 1, to: 1, kind: 'heading', text: '1 Scope' }],
		},
		'a heading wrapped in double asterisks → text without them': {
			blocks: [raw('**1  Scope**')],
			expected: [{ from: 1, to: 1, kind: 'heading', text: '1 Scope' }],
		},
		'a heading wrapped in double underscores → text without them': {
			blocks: [raw('__1  Scope__')],
			expected: [{ from: 1, to: 1, kind: 'heading', text: '1 Scope' }],
		},
		'a prose line behind a quote marker → text without it': {
			blocks: [raw('> Quoted words.')],
			expected: [{ from: 1, to: 1, kind: 'prose', text: 'Quoted words.' }],
		},
		'a prose line wrapped in double asterisks → text without them': {
			blocks: [raw('**Bold words**')],
			expected: [{ from: 1, to: 1, kind: 'prose', text: 'Bold words' }],
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			expect(logicalLinesOf(indexSynthetic({ blocks: testCase.blocks }))).toEqual(testCase.expected)
		})
})
