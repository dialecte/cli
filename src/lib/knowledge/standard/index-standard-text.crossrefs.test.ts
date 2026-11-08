import { indexSynthetic } from '../../../../test/index-synthetic-standard.ts'
import { citationOf } from '../../../../test/synthetic-standard.ts'

import { describe, expect, it } from 'vitest'

import type { SyntheticBlock } from '../../../../test/synthetic-standard.types.ts'
import type { StandardCrossReference, StandardFileIndex } from './standard-index.types.ts'

type TestCase = {
	blocks: SyntheticBlock[]
	expected: StandardCrossReference[]
}

function heading(number: string, title: string): SyntheticBlock {
	return { kind: 'heading', number, title }
}

function raw(...lines: string[]): SyntheticBlock {
	return { kind: 'raw', lines }
}

/** The headings `1`, `1.1`, `1.1.1`, a blank line, then the sentence: the sentence is line 5. */
function underNestedHeadings(sentence: string): SyntheticBlock[] {
	return [
		heading('1', 'Alpha'),
		heading('1.1', 'Beta'),
		heading('1.1.1', 'Gamma'),
		{ kind: 'blank' },
		raw(sentence),
	]
}

function capitalised(text: string): string {
	return `${text.charAt(0).toUpperCase()}${text.slice(1)}`
}

function crossReferencesOf(index: StandardFileIndex): StandardCrossReference[] {
	return index.crossReferences
}

describe('cross-references within one file', () => {
	const testCases: Record<string, TestCase> = {
		'the clause word and a number of a kept heading → target the number, resolved': {
			blocks: [
				heading('1', 'Alpha'),
				heading('1.1', 'Beta'),
				{ kind: 'blank' },
				raw(`As stated in ${citationOf({ word: 'clause', number: '1.1' })}.`),
			],
			expected: [{ from: 4, inClause: '1.1', target: '1.1', resolved: true }],
		},
		'the clause word and a number no heading has → not resolved': {
			blocks: [
				heading('1', 'Alpha'),
				heading('1.1', 'Beta'),
				{ kind: 'blank' },
				raw(`As stated in ${citationOf({ word: 'clause', number: '9.9' })}.`),
			],
			expected: [{ from: 4, inClause: '1.1', target: '9.9', resolved: false }],
		},
		'the clause word and a single number → target the number, resolved': {
			blocks: [
				heading('1', 'Alpha'),
				heading('2', 'Beta'),
				{ kind: 'blank' },
				raw(`As stated in ${citationOf({ word: 'clause', number: '2' })}.`),
			],
			expected: [{ from: 4, inClause: '2', target: '2', resolved: true }],
		},
		'the subclause word and a number → one reference, not two': {
			blocks: [
				heading('1', 'Alpha'),
				heading('1.1', 'Beta'),
				{ kind: 'blank' },
				raw(`As stated in ${citationOf({ word: 'subclause', number: '1.1' })}.`),
			],
			expected: [{ from: 4, inClause: '1.1', target: '1.1', resolved: true }],
		},
		'a capitalised clause word at the start of a sentence → a reference': {
			blocks: [
				heading('1', 'Alpha'),
				heading('1.1', 'Beta'),
				{ kind: 'blank' },
				raw(`${capitalised(citationOf({ word: 'clause', number: '1.1' }))} applies here.`),
			],
			expected: [{ from: 4, inClause: '1.1', target: '1.1', resolved: true }],
		},
		'a capitalised See and a number at the start of a sentence → a reference': {
			blocks: [
				heading('1', 'Alpha'),
				heading('1.1', 'Beta'),
				{ kind: 'blank' },
				raw('See 1.1 for details.'),
			],
			expected: [{ from: 4, inClause: '1.1', target: '1.1', resolved: true }],
		},
		'a reference on the second line of a joined paragraph → from is that original line': {
			blocks: [
				heading('1', 'Alpha'),
				heading('1.1', 'Beta'),
				{ kind: 'blank' },
				raw(
					'Opening words of the paragraph',
					`continue with ${citationOf({ word: 'clause', number: '1.1' })} here.`,
				),
			],
			expected: [{ from: 5, inClause: '1.1', target: '1.1', resolved: true }],
		},
		'the word see and a number → target the number, resolved': {
			blocks: [
				heading('1', 'Alpha'),
				heading('1.1', 'Beta'),
				{ kind: 'blank' },
				raw('For details see 1.1.'),
			],
			expected: [{ from: 4, inClause: '1.1', target: '1.1', resolved: true }],
		},
		'the word see and a three-part number → target the number, resolved': {
			blocks: underNestedHeadings('For details see 1.1.1.'),
			expected: [{ from: 5, inClause: '1.1.1', target: '1.1.1', resolved: true }],
		},
		'a three-part number in parentheses → target the number, resolved': {
			blocks: underNestedHeadings('The value (1.1.1) applies.'),
			expected: [{ from: 5, inClause: '1.1.1', target: '1.1.1', resolved: true }],
		},
		'a three-part number in parentheses that no heading has → not resolved': {
			blocks: underNestedHeadings('The value (1.4.7) applies.'),
			expected: [{ from: 5, inClause: '1.1.1', target: '1.4.7', resolved: false }],
		},
		'a two-part number in parentheses → no reference': {
			blocks: underNestedHeadings('The value (1.1) applies.'),
			expected: [],
		},
		'a three-part number outside parentheses without see → no reference': {
			blocks: underNestedHeadings('The value 1.1.1 applies.'),
			expected: [],
		},
		'the table word and the number of a caption in the file → target table-n, resolved': {
			blocks: [
				heading('1', 'Alpha'),
				{ kind: 'caption', word: 'table', number: '1', title: 'Sample values' },
				{
					kind: 'table',
					columns: ['Name', 'Value'],
					rows: [
						['a', '1'],
						['b', '2'],
					],
				},
				{ kind: 'blank' },
				raw(`Values are listed in ${citationOf({ word: 'table', number: '1' })}.`),
			],
			expected: [{ from: 8, inClause: '1', target: 'table-1', resolved: true }],
		},
		'the table word and a number no caption has → not resolved': {
			blocks: [
				heading('1', 'Alpha'),
				{ kind: 'blank' },
				raw(`Values are listed in ${citationOf({ word: 'table', number: '7' })}.`),
			],
			expected: [{ from: 3, inClause: '1', target: 'table-7', resolved: false }],
		},
		'the table word and a lettered caption number → target table with the letter, resolved': {
			blocks: [
				heading('1', 'Alpha'),
				{ kind: 'caption', word: 'table', number: 'A.1', title: 'Sample values' },
				{ kind: 'table', columns: ['Name', 'Value'], rows: [['a', '1']], withSeparator: false },
				{ kind: 'blank' },
				raw(`Values are listed in ${citationOf({ word: 'table', number: 'A.1' })}.`),
			],
			expected: [{ from: 6, inClause: '1', target: 'table-A.1', resolved: true }],
		},
		'the annex word and the letter of an annex heading → target the letter, resolved': {
			blocks: [
				heading('1', 'Alpha'),
				raw(`Details are in ${citationOf({ word: 'annex', number: 'A' })}.`),
				{ kind: 'annexHeading', letter: 'A', title: 'First annex' },
			],
			expected: [{ from: 2, inClause: '1', target: 'A', resolved: true }],
		},
		'the annex word and a letter no annex heading has → not resolved': {
			blocks: [
				heading('1', 'Alpha'),
				raw(`Details are in ${citationOf({ word: 'annex', number: 'C' })}.`),
				{ kind: 'annexHeading', letter: 'A', title: 'First annex' },
			],
			expected: [{ from: 2, inClause: '1', target: 'C', resolved: false }],
		},
		'two references in one line → two entries in the order of the line': {
			blocks: [
				heading('1', 'Alpha'),
				heading('1.1', 'Beta'),
				heading('1.2', 'Gamma'),
				{ kind: 'blank' },
				raw(
					`Compare ${citationOf({ word: 'clause', number: '1.1' })} and ${citationOf({ word: 'clause', number: '1.2' })}.`,
				),
			],
			expected: [
				{ from: 5, inClause: '1.2', target: '1.1', resolved: true },
				{ from: 5, inClause: '1.2', target: '1.2', resolved: true },
			],
		},
		'the same target on two lines → two entries, each with its own line': {
			blocks: [
				heading('1', 'Alpha'),
				raw(`First mention of ${citationOf({ word: 'clause', number: '1' })}.`, ''),
				raw(`Second mention of ${citationOf({ word: 'clause', number: '1' })}.`),
			],
			expected: [
				{ from: 2, inClause: '1', target: '1', resolved: true },
				{ from: 4, inClause: '1', target: '1', resolved: true },
			],
		},
		'a reference before the first heading → no clause': {
			blocks: [
				raw(`Preface mentions ${citationOf({ word: 'clause', number: '1.1' })}.`, ''),
				heading('1', 'Alpha'),
				heading('1.1', 'Beta'),
			],
			expected: [{ from: 1, inClause: null, target: '1.1', resolved: true }],
		},
		'a number that is a candidate turned into prose → not resolved': {
			blocks: [
				heading('1', 'Alpha'),
				heading('2', 'Beta'),
				heading('9', 'Gamma'),
				heading('3', 'Delta'),
				{ kind: 'blank' },
				raw(`As stated in ${citationOf({ word: 'clause', number: '9' })}.`),
			],
			expected: [{ from: 6, inClause: '3', target: '9', resolved: false }],
		},
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			expect(crossReferencesOf(indexSynthetic({ blocks: testCase.blocks }))).toEqual(
				testCase.expected,
			)
		})
})
