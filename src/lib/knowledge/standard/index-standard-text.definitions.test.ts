import { indexSynthetic } from '../../../../test/index-synthetic-standard.ts'

import { describe, expect, it } from 'vitest'

import type { SyntheticBlock } from '../../../../test/synthetic-standard.types.ts'
import type { StandardDefinition, StandardFileIndex } from './standard-index.types.ts'

type TestCase = {
	blocks: SyntheticBlock[]
	expected: StandardDefinition[]
}

function heading(number: string, title: string): SyntheticBlock {
	return { kind: 'heading', number, title }
}

function raw(...lines: string[]): SyntheticBlock {
	return { kind: 'raw', lines }
}

function definitionsOf(index: StandardFileIndex): StandardDefinition[] {
	return index.definitions
}

describe('definitions inside the terms clause', () => {
	const testCases: Record<string, TestCase> = {
		'a term on the number line → the term, up to the line before the next definition': {
			blocks: [
				heading('3', 'Terms and definitions'),
				{ kind: 'definition', number: '3.1', term: 'alpha node', layout: 'inline' },
				raw('Describes the alpha node.', ''),
				{ kind: 'definition', number: '3.2', term: 'beta node', layout: 'inline' },
				raw('Describes the beta node.'),
				heading('4', 'Next part'),
			],
			expected: [
				{ term: 'alpha node', number: '3.1', from: 2, to: 4 },
				{ term: 'beta node', number: '3.2', from: 5, to: 6 },
			],
		},
		'a number alone on its line → the term is the next non-blank line': {
			blocks: [
				heading('3', 'Terms and definitions'),
				{ kind: 'definition', number: '3.1', term: 'alpha node', layout: 'split' },
				raw('', 'Describes the alpha node.', ''),
				{ kind: 'definition', number: '3.2', term: 'beta node', layout: 'split' },
				raw('', 'Describes the beta node.'),
			],
			expected: [
				{ term: 'alpha node', number: '3.1', from: 2, to: 6 },
				{ term: 'beta node', number: '3.2', from: 7, to: 10 },
			],
		},
		'a number alone, a blank line, then the term → the term is the next non-blank line': {
			blocks: [
				heading('3', 'Terms and definitions'),
				raw('3.1', '', 'alpha node', ''),
				raw('Describes the alpha node.'),
			],
			expected: [{ term: 'alpha node', number: '3.1', from: 2, to: 6 }],
		},
		'a three-part number → a definition': {
			blocks: [
				heading('3', 'Terms and definitions'),
				{ kind: 'definition', number: '3.1.2', term: 'inner term', layout: 'inline' },
				raw('Describes it.'),
			],
			expected: [{ term: 'inner term', number: '3.1.2', from: 2, to: 3 }],
		},
		'a terms clause with another number → its numbers are definitions': {
			blocks: [
				heading('5', 'Terms and definitions'),
				{ kind: 'definition', number: '5.1', term: 'alpha node', layout: 'inline' },
				raw('Describes the alpha node.'),
			],
			expected: [{ term: 'alpha node', number: '5.1', from: 2, to: 3 }],
		},
		'a capitalised term → still a definition, not a heading': {
			blocks: [
				heading('3', 'TERMS and definitions'),
				{ kind: 'definition', number: '3.1', term: 'Alpha node', layout: 'inline' },
				heading('4', 'Next part'),
			],
			expected: [{ term: 'Alpha node', number: '3.1', from: 2, to: 2 }],
		},
		'a term with a ligature and a non-breaking space → normalised term': {
			blocks: [heading('3', 'Terms and definitions'), raw('3.1  conﬁg node')],
			expected: [{ term: 'config node', number: '3.1', from: 2, to: 2 }],
		},
		'numbers like a definition outside a terms clause → no definition': {
			blocks: [heading('3', 'Units'), heading('3.1', 'Alpha node')],
			expected: [],
		},
		'a number of another clause inside the terms clause → no definition': {
			blocks: [heading('3', 'Terms and definitions'), heading('4.1', 'Capital title')],
			expected: [],
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			expect(definitionsOf(indexSynthetic({ blocks: testCase.blocks }))).toEqual(testCase.expected)
		})
})
