import { indexSynthetic } from '../../../../test/index-synthetic-standard.ts'
import { CITATION_WORDS } from '../../../../test/synthetic-standard.constants.ts'
import { captionLine, citationOf } from '../../../../test/synthetic-standard.ts'

import { describe, expect, it } from 'vitest'

import type { SyntheticBlock } from '../../../../test/synthetic-standard.types.ts'
import type { StandardFileIndex, StandardLineKind } from './standard-index.types.ts'

type TestCase = {
	blocks: SyntheticBlock[]
	expected: StandardLineKind[]
}

function raw(...lines: string[]): SyntheticBlock {
	return { kind: 'raw', lines }
}

function titleOfLength(length: number): string {
	return `T${'a'.repeat(length - 1)}`
}

function kindsOf(index: StandardFileIndex): StandardLineKind[] {
	return index.logicalLines.map((line) => line.kind)
}

describe('classification of original lines, observed through the kinds of the logical lines', () => {
	const testCases: Record<string, TestCase> = {
		'only blank and whitespace lines → no logical line': {
			blocks: [raw('', '   ', '\t')],
			expected: [],
		},
		'a line starting with a pipe → table': { blocks: [raw('| a | b |')], expected: ['table'] },
		'an indented line starting with a pipe → table': {
			blocks: [raw('   | a | b |')],
			expected: ['table'],
		},
		'a line starting with an angle bracket → code': {
			blocks: [raw('<D a="1"/>')],
			expected: ['code'],
		},
		'an indented line starting with an angle bracket → code': {
			blocks: [raw('    <AA_1 b="2">')],
			expected: ['code'],
		},
		'a fenced block → every line code, the fence lines and a heading-shaped line inside included': {
			blocks: [
				{ kind: 'fence', lines: ['1  Scope', 'free words'] },
				{ kind: 'heading', number: '2', title: 'Real' },
			],
			expected: ['code', 'code', 'code', 'code', 'heading'],
		},
		'a letter-spaced line whose rebuilt form starts with an angle bracket → code': {
			blocks: [{ kind: 'letterSpaced', text: '<D a=1>' }],
			expected: ['code'],
		},
		'a number and a capitalised title → heading': {
			blocks: [{ kind: 'heading', number: '1', title: 'Scope' }],
			expected: ['heading'],
		},
		'a number and one space before the title → heading': {
			blocks: [raw('1 Scope')],
			expected: ['heading'],
		},
		'a one-part number with a trailing dot and a title, in a file with no other style → heading': {
			blocks: [raw('1.  Scope')],
			expected: ['heading'],
		},
		'a dotted one-part line in a file whose top-level headings have no dot → prose (a list item)': {
			blocks: [{ kind: 'heading', number: '1', title: 'Scope' }, raw('2. Second item')],
			expected: ['heading', 'prose'],
		},
		'a dotted one-part line in a file with a marked top-level heading → prose (a list item)': {
			blocks: [
				{ kind: 'heading', number: '1', title: 'Scope', marker: '## ' },
				raw('2. Second item'),
			],
			expected: ['heading', 'prose'],
		},
		'three markdown ordered list items after an undotted heading, each its own line → prose each': {
			blocks: [
				{ kind: 'heading', number: '1', title: 'Scope' },
				raw('1. First item'),
				{ kind: 'blank' },
				raw('2. Second item'),
				{ kind: 'blank' },
				raw('3. Third item'),
			],
			expected: ['heading', 'prose', 'prose', 'prose'],
		},
		'a one-part number with a trailing dot behind a markdown marker → heading': {
			blocks: [raw('## 1. Scope')],
			expected: ['heading'],
		},
		'a multi-part number with a trailing dot and a title → heading': {
			blocks: [raw('4.1.  Title')],
			expected: ['heading'],
		},
		'a nested number and a title → heading': {
			blocks: [{ kind: 'heading', number: '2.3.4', title: 'Deep title' }],
			expected: ['heading'],
		},
		'an annex letter line → heading': {
			blocks: [{ kind: 'annexHeading', letter: 'A', title: 'Sample things' }],
			expected: ['heading'],
		},
		'an annex line with a word before the title → heading': {
			blocks: [
				{
					kind: 'annexHeading',
					letter: 'A',
					title: 'Sample things',
					qualifier: { text: 'normative', position: 'before' },
				},
			],
			expected: ['heading'],
		},
		'an annex line with a word after the title → heading': {
			blocks: [
				{
					kind: 'annexHeading',
					letter: 'A',
					title: 'Sample things',
					qualifier: { text: 'informative', position: 'after' },
				},
			],
			expected: ['heading'],
		},
		'an annex sub-number and a title → heading': {
			blocks: [{ kind: 'heading', number: 'A.1', title: 'Sub title' }],
			expected: ['heading'],
		},
		'a title starting in lower case → prose': {
			blocks: [{ kind: 'heading', number: '1', title: 'scope' }],
			expected: ['prose'],
		},
		'a number with no title → prose': { blocks: [raw('2')], expected: ['prose'] },
		'a title of 119 characters → heading': {
			blocks: [{ kind: 'heading', number: '1', title: titleOfLength(119) }],
			expected: ['heading'],
		},
		'a title of 120 characters → prose': {
			blocks: [{ kind: 'heading', number: '1', title: titleOfLength(120) }],
			expected: ['prose'],
		},
		'a top-level number of 50 → heading': {
			blocks: [{ kind: 'heading', number: '50', title: 'Last one' }],
			expected: ['heading'],
		},
		'a top-level number of 51 → prose': {
			blocks: [{ kind: 'heading', number: '51', title: 'Change entry' }],
			expected: ['prose'],
		},
		'a four-digit top-level number → prose': {
			blocks: [raw('1672  Change entry')],
			expected: ['prose'],
		},
		'a heading behind a markdown hash marker → heading': {
			blocks: [{ kind: 'heading', number: '1', title: 'Scope', marker: '## ' }],
			expected: ['heading'],
		},
		'a heading behind a quote marker → heading': {
			blocks: [{ kind: 'heading', number: '1', title: 'Scope', marker: '> ' }],
			expected: ['heading'],
		},
		'a heading wrapped in double asterisks → heading': {
			blocks: [raw('**1  Scope**')],
			expected: ['heading'],
		},
		'a heading wrapped in double underscores → heading': {
			blocks: [raw('__1  Scope__')],
			expected: ['heading'],
		},
		'a heading-shaped line with four dots → toc': {
			blocks: [raw('1  Scope ....')],
			expected: ['toc'],
		},
		'a heading-shaped line with three dots → heading': {
			blocks: [raw('1  Wait...')],
			expected: ['heading'],
		},
		'a heading-shaped line with three dot-space pairs → toc': {
			blocks: [raw('1  Units . . . 9')],
			expected: ['toc'],
		},
		'a heading-shaped line with two dot-space pairs → heading': {
			blocks: [raw('1  Units . . 9')],
			expected: ['heading'],
		},
		'a toc entry with a page number → toc': {
			blocks: [{ kind: 'tocEntry', number: '1.2', title: 'Overview', page: '12' }],
			expected: ['toc'],
		},
		'an annex line with a dot leader → toc': {
			blocks: [raw(`${CITATION_WORDS.annex} A  Sample things ........ 40`)],
			expected: ['toc'],
		},
		'a line that is not heading-shaped, with a dot leader → prose': {
			blocks: [raw('some words ........ 40')],
			expected: ['prose'],
		},
		'a definition number and a term inside the terms clause → definition': {
			blocks: [
				{ kind: 'heading', number: '3', title: 'Terms and definitions' },
				{ kind: 'definition', number: '3.1', term: 'Alpha node', layout: 'inline' },
				{ kind: 'blank' },
				{ kind: 'definition', number: '3.2', term: 'beta node', layout: 'split' },
				{ kind: 'blank' },
				{ kind: 'definition', number: '3.2.1', term: 'Inner term', layout: 'inline' },
				{ kind: 'blank' },
				{ kind: 'heading', number: '4', title: 'Next part' },
			],
			expected: ['heading', 'definition', 'definition', 'prose', 'definition', 'heading'],
		},
		'a terms title in capitals → still the terms clause': {
			blocks: [
				{ kind: 'heading', number: '3', title: 'TERMS and definitions' },
				{ kind: 'definition', number: '3.1', term: 'Alpha node', layout: 'inline' },
			],
			expected: ['heading', 'definition'],
		},
		'a terms clause with another top-level number → its numbers are definitions': {
			blocks: [
				{ kind: 'heading', number: '5', title: 'Terms and definitions' },
				{ kind: 'definition', number: '5.1', term: 'Alpha node', layout: 'inline' },
			],
			expected: ['heading', 'definition'],
		},
		'the same numbers outside a terms clause → headings': {
			blocks: [
				{ kind: 'heading', number: '3', title: 'Units' },
				{ kind: 'heading', number: '3.1', title: 'Alpha node' },
				{ kind: 'heading', number: '4', title: 'Next part' },
			],
			expected: ['heading', 'heading', 'heading'],
		},
		'a number of another clause inside the terms clause → heading': {
			blocks: [
				{ kind: 'heading', number: '3', title: 'Terms and definitions' },
				{ kind: 'heading', number: '4.1', title: 'Capital title' },
			],
			expected: ['heading', 'heading'],
		},
		'a table caption with a hyphen → caption': {
			blocks: [{ kind: 'caption', word: 'table', number: '1', title: 'Sample', separator: ' - ' }],
			expected: ['caption'],
		},
		'a table caption with an en dash → caption': {
			blocks: [{ kind: 'caption', word: 'table', number: '1', title: 'Sample', separator: ' – ' }],
			expected: ['caption'],
		},
		'a table caption with an em dash → caption': {
			blocks: [{ kind: 'caption', word: 'table', number: '1', title: 'Sample', separator: ' — ' }],
			expected: ['caption'],
		},
		'a table caption with a colon → caption': {
			blocks: [{ kind: 'caption', word: 'table', number: '1', title: 'Sample', separator: ': ' }],
			expected: ['caption'],
		},
		'a table caption with a dot → caption': {
			blocks: [{ kind: 'caption', word: 'table', number: '1', title: 'Sample', separator: '. ' }],
			expected: ['caption'],
		},
		'a table caption that ends after the number → caption': {
			blocks: [{ kind: 'caption', word: 'table', number: '3' }],
			expected: ['caption'],
		},
		'a table caption with a lettered number → caption': {
			blocks: [{ kind: 'caption', word: 'table', number: 'A.1', title: 'Sample' }],
			expected: ['caption'],
		},
		'a figure caption → caption': {
			blocks: [{ kind: 'caption', word: 'figure', number: '2', title: 'Layout', separator: ': ' }],
			expected: ['caption'],
		},
		'a caption word, a number and a word → prose': {
			blocks: [raw(`${citationOf({ word: 'table', number: '1' })} shows values.`)],
			expected: ['prose'],
		},
		'the plural of the caption word with a number → prose': {
			blocks: [raw(`${CITATION_WORDS.table}s 1 and 2 list values.`)],
			expected: ['prose'],
		},
		'a caption word with a number glued to a letter → prose': {
			blocks: [raw(captionLine({ word: 'table', number: '1a', title: 'Sample' }))],
			expected: ['prose'],
		},
		'a caption word with no number → prose': {
			blocks: [raw(`${CITATION_WORDS.table} of values`)],
			expected: ['prose'],
		},
		'an unnumbered line behind a markdown marker, in capitals → prose': {
			blocks: [raw('# FOREWORD')],
			expected: ['prose'],
		},
		'a caption wrapped in double asterisks → caption, not a heading': {
			blocks: [
				raw(
					`**${captionLine({ word: 'table', number: '25', title: 'Sample', separator: ' – ' })}**`,
				),
			],
			expected: ['caption'],
		},
		'an xml fence → every line code': {
			blocks: [{ kind: 'fence', lines: ['<?xml version="1.0"?>', '<D a="1"/>'] }],
			expected: ['code', 'code', 'code', 'code'],
		},
		'a plain sentence → prose': { blocks: [raw('A plain sentence.')], expected: ['prose'] },
	}

	for (const [title, testCase] of Object.entries(testCases))
		it(title, () => {
			expect(kindsOf(indexSynthetic({ blocks: testCase.blocks }))).toEqual(testCase.expected)
		})
})
