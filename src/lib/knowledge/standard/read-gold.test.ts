import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { temporaryFolder } from '../../../../test/scratch-repository.ts'
import { readGold } from './read-gold.ts'

import { describe, expect, it } from 'vitest'

import type { StandardGoldItem } from './standard-search.types.ts'

type KeptCase = { lines: object[]; expected: StandardGoldItem[] }

/** A refusal starts with the path and the line it names and holds each of the words. */
type RefusedCase = { text: string; line: number; words: string[] }

const SHAPE_WORDS = ['expected', 'kind?, answer?, status?']
const KIND_WORDS = ['fact', 'polarity', 'exception', 'not-in-text']

const FULL_LINE = {
	question: 'May AA_1 hold AAA_1?',
	kind: 'polarity',
	answer: 'no, it may not',
	expected: [{ file: 'Example-0000/Tag', quote: 'the aa_1 element holds the parts.' }],
	status: 'checked',
}

/** The gold file `text` written in a folder of its own: its path. */
function goldFileOf(text: string): string {
	const path = join(temporaryFolder('dialecte-read-gold-'), 'gold.jsonl')
	writeFileSync(path, text)
	return path
}

/** Whether a refusal starts with its prefix, and which of the words it does not hold. */
function refusalFaultsOf(params: {
	refusal: StandardGoldItem[] | string
	prefix: string
	words: string[]
}): { starts: boolean; missing: string[] } {
	const text = typeof params.refusal === 'string' ? params.refusal : ''
	return {
		starts: text.startsWith(params.prefix),
		missing: params.words.filter((word) => !text.includes(word)),
	}
}

function jsonLinesOf(lines: object[]): string {
	return `${lines.map((line) => JSON.stringify(line)).join('\n\n')}\n`
}

describe('readGold: the items of a gold file keep kind, answer and status', () => {
	const keptCases: Record<string, KeptCase> = {
		'a line with kind, answer and status → the item keeps the three, its file id lowercased': {
			lines: [FULL_LINE],
			expected: [
				{
					question: FULL_LINE.question,
					kind: 'polarity',
					answer: 'no, it may not',
					status: 'checked',
					expected: [{ file: 'example-0000/tag', quote: 'the aa_1 element holds the parts.' }],
				},
			],
		},
		'a line of kind fact → the item keeps the kind': {
			lines: [{ question: 'Q', kind: 'fact', expected: [] }],
			expected: [{ question: 'Q', kind: 'fact', expected: [] }],
		},
		'a line of kind exception → the item keeps the kind': {
			lines: [{ question: 'Q', kind: 'exception', expected: [] }],
			expected: [{ question: 'Q', kind: 'exception', expected: [] }],
		},
		'a line of kind not-in-text → the item keeps the kind': {
			lines: [{ question: 'Q', kind: 'not-in-text', expected: [] }],
			expected: [{ question: 'Q', kind: 'not-in-text', expected: [] }],
		},
		'an older line with none of the three → the item holds the question and the quotes only': {
			lines: [{ question: 'Q', expected: [{ file: 'a/b', quote: 'q' }] }],
			expected: [{ question: 'Q', expected: [{ file: 'a/b', quote: 'q' }] }],
		},
		'a line with only a status → the item keeps the status and neither of the other two': {
			lines: [{ question: 'Q', status: 'draft', expected: [] }],
			expected: [{ question: 'Q', status: 'draft', expected: [] }],
		},
		'a line with an about and an unknown field → the about is kept, the unknown field is not': {
			lines: [{ question: 'Q', about: 'AA_1', source: 'elsewhere', expected: [] }],
			expected: [{ question: 'Q', about: 'AA_1', expected: [] }],
		},
	}

	for (const [title, testCase] of Object.entries(keptCases))
		it(title, () => {
			const path = goldFileOf(jsonLinesOf(testCase.lines))

			expect(readGold({ path })).toStrictEqual(testCase.expected)
		})

	it('blank lines between the items → skipped, the items in file order', () => {
		const path = goldFileOf(
			`\n${jsonLinesOf([FULL_LINE, { question: 'Second', expected: [] }])}\n\n`,
		)

		expect((readGold({ path }) as StandardGoldItem[]).map((item) => item.question)).toStrictEqual([
			FULL_LINE.question,
			'Second',
		])
	})
})

describe('readGold: a broken file is refused with the wording the standard command gave', () => {
	const refusedCases: Record<string, RefusedCase> = {
		'a second line that is not JSON → the path, the line number and "not a JSON object"': {
			text: `${JSON.stringify(FULL_LINE)}\nnot json\n`,
			line: 2,
			words: ['not a JSON object'],
		},
		'a line that is a JSON number → "not a JSON object"': {
			text: '3\n',
			line: 1,
			words: ['not a JSON object'],
		},
		'a line with no expected list → the shape message listing kind, answer and status': {
			text: `${JSON.stringify({ question: 'Q' })}\n`,
			line: 1,
			words: SHAPE_WORDS,
		},
		'a line whose kind is not a text → the line and the four kinds': {
			text: `${JSON.stringify({ question: 'Q', kind: 3, expected: [] })}\n`,
			line: 1,
			words: KIND_WORDS,
		},
		'a line whose kind is not one of the four → the line and the four kinds': {
			text: `${JSON.stringify({ question: 'Q', kind: 'weird', expected: [] })}\n`,
			line: 1,
			words: ['weird', ...KIND_WORDS],
		},
		'a line whose answer is not a text → the shape message': {
			text: `${JSON.stringify({ question: 'Q', answer: ['a'], expected: [] })}\n`,
			line: 1,
			words: SHAPE_WORDS,
		},
		'a line whose status is not a text → the shape message': {
			text: `${JSON.stringify({ question: 'Q', status: false, expected: [] })}\n`,
			line: 1,
			words: SHAPE_WORDS,
		},
	}

	for (const [title, testCase] of Object.entries(refusedCases))
		it(title, () => {
			const path = goldFileOf(testCase.text)

			expect(
				refusalFaultsOf({
					refusal: readGold({ path }),
					prefix: `${path} line ${testCase.line}: `,
					words: testCase.words,
				}),
			).toEqual({ starts: true, missing: [] })
		})

	it('a path that is not a file → "cannot read the gold file" and the path', () => {
		const path = join(temporaryFolder('dialecte-read-gold-'), 'absent.jsonl')

		expect(readGold({ path })).toBe(`cannot read the gold file ${path}`)
	})
})
