import { EXAMPLE_CODE } from '../../../../test/ask-fixtures.constants.ts'
import {
	API_INDEX_HASH,
	CATALOGUE_HASH,
	CORE_CATALOGUES,
	CORE_PACKAGE,
	CROWDED_METHOD_ROWS,
	DIALECTE_PACKAGE,
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
import { readFactFile } from '../../../../test/fact-fixtures.ts'
import { loadMultiDeclaredDialecte } from '../../../../test/multi-declared-dialecte.ts'
import { runLadder } from './run-ladder.ts'

import { beforeAll, describe, expect, it } from 'vitest'

import type { LoadedDialecte } from '../../schema/schema.types.ts'

let dialecte: LoadedDialecte

beforeAll(async () => {
	dialecte = await loadMultiDeclaredDialecte()
})

describe('runLadder rung 2: a code the catalogue explains, a method the api index names (D10, cases 7, 8)', () => {
	it('7 a code one entry explains -> rung 2, answered, the message, recorded with the catalogue hash', () => {
		const folder = newFactsFolder()

		expect(
			runLadder({
				request: requestOf({ question: EXAMPLE_CODE }),
				setup: setupOf({ dialecte, factsFolder: folder }),
				ask: 'A-0001',
				lot: null,
			}),
		).toMatchObject({
			kind: 'code',
			rung: 2,
			state: 'answered',
			answer: { value: EXAMPLE_MESSAGE },
			fact: 'F-0001',
		})
		expect(readFactFile({ folder, id: 'F-0001' })).toMatchObject({
			source: 'dialecte',
			sources: [{ kind: 'dialecte', package: DIALECTE_PACKAGE, catalogue: CATALOGUE_HASH }],
		})
	})

	it('8 a method whose intents hold every content word of the need -> answered, its path, the index hash', () => {
		const folder = newFactsFolder()

		expect(
			runLadder({
				request: requestOf({ question: 'which method read the information of an element' }),
				setup: setupOf({ dialecte, factsFolder: folder }),
				ask: 'A-0001',
				lot: null,
			}),
		).toMatchObject({
			kind: 'method',
			rung: 2,
			state: 'answered',
			answer: { verdict: 'value', value: INFO_METHOD_PATH },
			fact: 'F-0001',
		})
		expect(readFactFile({ folder, id: 'F-0001' })).toMatchObject({
			source: 'dialecte',
			sources: [{ kind: 'dialecte', package: DIALECTE_PACKAGE, apiJson: API_INDEX_HASH }],
		})
	})
})

describe('runLadder rung 2 sources name the package that ships what answered (D10b)', () => {
	it('a code of core catalogue -> the recorded source names core package', () => {
		const folder = newFactsFolder()

		expect(
			runLadder({
				request: requestOf({ question: EXAMPLE_CODE }),
				setup: setupOf({ dialecte, factsFolder: folder, catalogues: CORE_CATALOGUES }),
				ask: 'A-0001',
				lot: null,
			}),
		).toMatchObject({ rung: 2, state: 'answered', fact: 'F-0001' })
		expect(readFactFile({ folder, id: 'F-0001' })).toMatchObject({
			sources: [{ kind: 'dialecte', package: CORE_PACKAGE, catalogue: CATALOGUE_HASH }],
		})
	})

	it('a method of the api index of core -> the recorded source names that index package', () => {
		const folder = newFactsFolder()

		expect(
			runLadder({
				request: requestOf({ question: 'which method read the information of an element' }),
				setup: setupOf({
					dialecte,
					factsFolder: folder,
					apiIndex: apiIndexOf({ rows: INFO_METHOD_ROWS, packageName: CORE_PACKAGE }),
				}),
				ask: 'A-0001',
				lot: null,
			}),
		).toMatchObject({ rung: 2, state: 'answered', fact: 'F-0001' })
		expect(readFactFile({ folder, id: 'F-0001' })).toMatchObject({
			sources: [{ kind: 'dialecte', package: CORE_PACKAGE, apiJson: API_INDEX_HASH }],
		})
	})
})

describe('runLadder rung 2 without an answer: the ladder goes on (no documents: it stops here, needs-readers)', () => {
	it('an unknown code -> no answer, no fact', () => {
		expect(
			runLadder({
				request: requestOf({ question: 'what failed?', kind: 'code', code: 'ZZ9999' }),
				setup: setupOf({ dialecte, factsFolder: newFactsFolder() }),
				ask: 'A-0001',
				lot: null,
			}),
		).toMatchObject({ rung: 2, state: 'needs-readers', answer: null, fact: null })
	})

	it('a code two entries explain -> no answer: the entry is not chosen for the person', () => {
		expect(
			runLadder({
				request: requestOf({ question: EXAMPLE_CODE }),
				setup: setupOf({
					dialecte,
					factsFolder: newFactsFolder(),
					catalogues: TWICE_NAMED_CATALOGUES,
				}),
				ask: 'A-0001',
				lot: null,
			}),
		).toMatchObject({ rung: 2, state: 'needs-readers', answer: null })
	})

	it('a method whose intents miss a content word of the need -> no answer, the top 5 paths listed', () => {
		expect(
			runLadder({
				request: requestOf({ question: 'which method read beta of an element' }),
				setup: setupOf({
					dialecte,
					factsFolder: newFactsFolder(),
					apiIndex: apiIndexOf({ rows: CROWDED_METHOD_ROWS }),
				}),
				ask: 'A-0001',
				lot: null,
			}),
		).toMatchObject({
			rung: 2,
			state: 'needs-readers',
			answer: null,
			fact: null,
			methods: [
				'doc.query.read1',
				'doc.query.read2',
				'doc.query.read3',
				'doc.query.read4',
				'doc.query.read5',
			],
		})
	})
})
