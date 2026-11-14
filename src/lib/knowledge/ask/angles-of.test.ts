import { resolvedContext, subjectOf } from '../../../../test/ask-fixtures.ts'
import { loadMultiDeclaredDialecte } from '../../../../test/multi-declared-dialecte.ts'
import { anglesOf } from './angles-of.ts'

import { beforeAll, describe, expect, it } from 'vitest'

import type { LoadedDialecte } from '../../schema/schema.types.ts'
import type { AngleFamily, AnglesOfParams, AskAngle, AskKind } from './ask.types.ts'

const PACKAGE = '@dialecte/core-test'

let dialecte: LoadedDialecte

beforeAll(async () => {
	dialecte = await loadMultiDeclaredDialecte()
})

type AngleTerms = { family: AngleFamily; terms: string[] }

type AnglesRow = {
	/** The subject tag's parent; null leaves the tag without one. */
	parent: string | null
	kind: AskKind
	question: string
	methods: string[]
	/** False builds the case without the dialecte (a question about a method or a code only). */
	withDialecte: boolean
	expected: AngleTerms[]
}

function paramsOf(row: AnglesRow): AnglesOfParams {
	const subject = row.withDialecte
		? subjectOf({ tags: [{ tag: 'AAA_1', parent: row.parent }] })
		: subjectOf({})
	return {
		subject,
		context: row.withDialecte
			? resolvedContext({ packageName: PACKAGE, tag: 'AAA_1', parent: row.parent, declarations: 2 })
			: { package: null, tags: [], resolved: false, decision: false },
		kind: row.kind,
		question: row.question,
		dialecte: row.withDialecte ? dialecte : undefined,
		methods: row.methods,
		explained: [],
		standard: [],
	}
}

function withIds(terms: AngleTerms[]): AskAngle[] {
	return terms.map((angle, position) => ({ id: `a${position + 1}`, ...angle }))
}

describe('anglesOf: the families in order, each with its terms (D11, case 9)', () => {
	const rows: Record<string, AnglesRow> = {
		'AAA_1 under AA_1: the first declaration; the variants repeat the type and the values are empty, so neither gives an angle':
			{
				parent: 'AA_1',
				kind: 'documentation',
				question: 'documentation of AAA_1 under AA_1: the plain way',
				methods: [],
				withDialecte: true,
				expected: [
					{ family: 'subject', terms: ['AAA_1'] },
					{ family: 'type', terms: ['tAAA_1A'] },
					{ family: 'documentation', terms: ['plain', 'way', 'declar', 'aaa', '1'] },
					{ family: 'parents', terms: ['AA_1', 'AA_3', 'AA_4'] },
					{ family: 'children', terms: ['AAAA_1'] },
					{ family: 'attributes', terms: ['aAAA_1'] },
					// `plain`, `way`, `aaa` and `1` stay with the documentation: a term keeps its first family
					{ family: 'question', terms: ['documentation', 'under', 'aa'] },
				],
			},
		'AAA_1 under AA_2: the second declaration, with the values its attribute admits': {
			parent: 'AA_2',
			kind: 'semantic',
			question: 'which values may AAA_1 admit under AA_2',
			methods: [],
			withDialecte: true,
			expected: [
				{ family: 'subject', terms: ['AAA_1'] },
				{ family: 'type', terms: ['tAAA_1B'] },
				{ family: 'documentation', terms: ['extension', 'way', 'declar', 'aaa', '1'] },
				{ family: 'parents', terms: ['AA_2', 'AA_3', 'AA_4'] },
				{ family: 'children', terms: ['AAAA_2'] },
				{ family: 'attributes', terms: ['bAAA_1', 'ext:cAAA_1'] },
				{ family: 'values', terms: ['p', 'q', 'x'] },
				{ family: 'question', terms: ['valu', 'may', 'admit', 'under', 'aa', '2'] },
			],
		},
		'AAA_1 with no parent: the tag level, its two xsi:type variants (a variants family that differs from the type)':
			{
				parent: null,
				kind: 'variants',
				question: 'variants of AAA_1',
				methods: [],
				withDialecte: true,
				expected: [
					{ family: 'subject', terms: ['AAA_1'] },
					{ family: 'parents', terms: ['AA_1', 'AA_2', 'AA_3', 'AA_4', 'AA_5'] },
					{ family: 'children', terms: ['AAAA_1', 'AAAA_2', 'AAAA_3'] },
					{ family: 'attributes', terms: ['aAAA_1', 'bAAA_1', 'ext:cAAA_1'] },
					{ family: 'variants', terms: ['tAAA_1A', 'tAAA_1B'] },
					{ family: 'question', terms: ['variant', 'aaa', '1'] },
				],
			},
		'a method question with no tag: the methods and the question words only': {
			parent: null,
			kind: 'method',
			question: 'which method read information',
			methods: ['doc.query.info.of'],
			withDialecte: false,
			expected: [
				{ family: 'methods', terms: ['doc', 'query', 'info'] },
				{ family: 'question', terms: ['method', 'read', 'information'] },
			],
		},
	}

	for (const [name, row] of Object.entries(rows))
		it(`${name}`, () => {
			expect(anglesOf(paramsOf(row))).toEqual(withIds(row.expected))
		})

	it('the subject family holds the tags, then the attributes, the values and the codes of the subject', () => {
		expect(
			anglesOf({
				subject: subjectOf({
					tags: [{ tag: 'AA_1' }],
					attributes: ['aAA_1'],
					values: ['x'],
					codes: ['EX0001'],
				}),
				context: { package: null, tags: [], resolved: false, decision: false },
				kind: 'semantic',
				question: 'what about this',
				dialecte: undefined,
				methods: [],
				explained: [],
				standard: [],
			}),
		).toEqual([
			{ id: 'a1', family: 'subject', terms: ['AA_1', 'aAA_1', 'x', 'EX0001'] },
			{ id: 'a2', family: 'question', terms: ['about'] },
		])
	})

	it('the same inputs give the same list', () => {
		const row =
			rows['AAA_1 under AA_2: the second declaration, with the values its attribute admits']

		expect(anglesOf(paramsOf(row))).toEqual(anglesOf(paramsOf(row)))
	})
})
