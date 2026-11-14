import { EXAMPLE_CODE } from '../../../../test/ask-fixtures.constants.ts'
import {
	API_INDEX_HASH,
	CATALOGUE_HASH,
	CORE_CATALOGUES,
	CORE_PACKAGE,
	CROWDED_METHOD_ROWS,
	DIALECTE_PACKAGE,
	EXAMPLE_FIX,
	EXAMPLE_MESSAGE,
	INFO_METHOD_PATH,
	INFO_METHOD_ROWS,
	TWICE_NAMED_CATALOGUES,
} from '../../../../test/ask-ladder-fixtures.constants.ts'
import {
	apiIndexOf,
	newFactsFolder,
	requestOf,
	setupOf,
} from '../../../../test/ask-ladder-fixtures.ts'
import { loadMultiDeclaredDialecte } from '../../../../test/multi-declared-dialecte.ts'
import { answerFromDialecte } from './answer-from-dialecte.ts'

import { beforeAll, describe, expect, it } from 'vitest'

import type { ApiJson } from '../../api/api-json.types.ts'
import type { Catalogues } from '../../run/explain-code.types.ts'
import type { LoadedDialecte } from '../../schema/schema.types.ts'
import type { AskKind, KindSlots } from './ask.types.ts'

let dialecte: LoadedDialecte

beforeAll(async () => {
	dialecte = await loadMultiDeclaredDialecte()
})

type RungTwoRow = {
	kind: AskKind
	slots: KindSlots
	question: string
	catalogues?: Catalogues
	apiIndex?: () => ApiJson
}

describe('answerFromDialecte: rung 2 answers a code or a method, or lists the methods (D10, cases 7, 8)', () => {
	const rows: Record<string, RungTwoRow & { expected: object }> = {
		'7 a code one entry explains: the message, the fix line, the catalogue hash': {
			kind: 'code',
			slots: { code: EXAMPLE_CODE },
			question: EXAMPLE_CODE,
			expected: {
				answer: {
					verdict: 'value',
					value: EXAMPLE_MESSAGE,
					text: expect.stringContaining(EXAMPLE_FIX),
				},
				sources: [{ kind: 'dialecte', package: DIALECTE_PACKAGE, catalogue: CATALOGUE_HASH }],
			},
		},
		'8 a method whose intents hold every content word of the need: its path, the index hash': {
			kind: 'method',
			slots: { rest: 'read the information of an element' },
			question: 'which method read the information of an element',
			expected: {
				answer: { verdict: 'value', value: INFO_METHOD_PATH },
				sources: [{ kind: 'dialecte', package: DIALECTE_PACKAGE, apiJson: API_INDEX_HASH }],
			},
		},
		'D10b a code of core catalogue: the source names core package, not the dialecte': {
			kind: 'code',
			slots: { code: EXAMPLE_CODE },
			question: EXAMPLE_CODE,
			catalogues: CORE_CATALOGUES,
			expected: {
				answer: { verdict: 'value', value: EXAMPLE_MESSAGE },
				sources: [{ kind: 'dialecte', package: CORE_PACKAGE, catalogue: CATALOGUE_HASH }],
			},
		},
		'D10b a method of the api index of core: the source names the package of that index': {
			kind: 'method',
			slots: { rest: 'read the information of an element' },
			question: 'which method read the information of an element',
			apiIndex: () => apiIndexOf({ rows: INFO_METHOD_ROWS, packageName: CORE_PACKAGE }),
			expected: {
				answer: { verdict: 'value', value: INFO_METHOD_PATH },
				sources: [{ kind: 'dialecte', package: CORE_PACKAGE, apiJson: API_INDEX_HASH }],
			},
		},
		'8 a method whose intents miss a word of the need: the top 5 paths, no answer': {
			kind: 'method',
			slots: { rest: 'read beta of an element' },
			question: 'which method read beta of an element',
			apiIndex: () => apiIndexOf({ rows: CROWDED_METHOD_ROWS }),
			expected: {
				methods: [
					'doc.query.read1',
					'doc.query.read2',
					'doc.query.read3',
					'doc.query.read4',
					'doc.query.read5',
				],
			},
		},
	}

	for (const [name, row] of Object.entries(rows))
		it(`${name}`, () => {
			expect(
				answerFromDialecte({
					kind: row.kind,
					slots: row.slots,
					request: requestOf({ question: row.question }),
					setup: setupOf({
						dialecte,
						factsFolder: newFactsFolder(),
						catalogues: row.catalogues,
						apiIndex: row.apiIndex?.(),
					}),
				}),
			).toMatchObject(row.expected)
		})
})

describe('answerFromDialecte: rung 2 has nothing for the question (undefined)', () => {
	const rows: Record<string, RungTwoRow> = {
		'7 an unknown code': { kind: 'code', slots: { code: 'ZZ9999' }, question: 'ZZ9999' },
		'7 a code two entries explain (the entry is not chosen for the person)': {
			kind: 'code',
			slots: { code: EXAMPLE_CODE },
			question: EXAMPLE_CODE,
			catalogues: TWICE_NAMED_CATALOGUES,
		},
		'a structural kind is not a rung-2 question': {
			kind: 'children',
			slots: { tag: 'AA_1' },
			question: 'children of AA_1',
		},
	}

	for (const [name, row] of Object.entries(rows))
		it(`${name}`, () => {
			expect(
				answerFromDialecte({
					kind: row.kind,
					slots: row.slots,
					request: requestOf({ question: row.question }),
					setup: setupOf({
						dialecte,
						factsFolder: newFactsFolder(),
						catalogues: row.catalogues,
					}),
				}),
			).toBeUndefined()
		})
})
