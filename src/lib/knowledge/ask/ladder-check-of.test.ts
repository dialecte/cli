import { EXAMPLE_CODE } from '../../../../test/ask-fixtures.constants.ts'
import {
	API_INDEX_HASH,
	CATALOGUE_HASH,
	CHANGED_CATALOGUES,
	DIALECTE_PACKAGE,
	DIALECTE_VERSION,
	EXAMPLE_MESSAGE,
	INFO_METHOD_PATH,
} from '../../../../test/ask-ladder-fixtures.constants.ts'
import {
	apiIndexOf,
	childrenDraftOf,
	movedDifferentDialecte,
	movedSameDialecte,
	newFactsFolder,
	setupOf,
} from '../../../../test/ask-ladder-fixtures.ts'
import { wholeFactOf } from '../../../../test/fact-check-fixtures.ts'
import { factDraft } from '../../../../test/fact-fixtures.ts'
import { loadMultiDeclaredDialecte } from '../../../../test/multi-declared-dialecte.ts'
import { definitionHash } from '../../schema/definition-hash.ts'
import { ladderCheckOf } from './ladder-check-of.ts'

import { beforeAll, describe, expect, it } from 'vitest'

import type { LoadedDialecte } from '../../schema/schema.types.ts'
import type { CheckOutcome, Fact, FactSource } from '../facts/facts.types.ts'
import type { AskSetup } from './ask.types.ts'

const OLD_HASH = `sha256:${'0'.repeat(64)}`
const STANDARD_STALE: CheckOutcome = { state: 'stale', reason: 'the standard moved' }

let dialecte: LoadedDialecte

beforeAll(async () => {
	dialecte = await loadMultiDeclaredDialecte()
})

function schemaSource(params: { hash: string }): FactSource {
	return {
		kind: 'schema',
		package: DIALECTE_PACKAGE,
		version: DIALECTE_VERSION,
		definitionHash: params.hash,
	}
}

function schemaFact(params: { hash: string }): Fact {
	return wholeFactOf({
		draft: childrenDraftOf({ source: 'schema', sources: [schemaSource({ hash: params.hash })] }),
	})
}

function codeFact(params: { catalogue: string }): Fact {
	return wholeFactOf({
		draft: factDraft({
			question: EXAMPLE_CODE,
			subject: {
				package: DIALECTE_PACKAGE,
				tags: [],
				attributes: [],
				codes: [EXAMPLE_CODE],
				methods: [],
			},
			kind: 'code',
			answer: { verdict: 'value', value: EXAMPLE_MESSAGE, text: 'Run the example again.' },
			source: 'dialecte',
			sources: [{ kind: 'dialecte', package: DIALECTE_PACKAGE, catalogue: params.catalogue }],
		}),
	})
}

function methodFact(params: { apiJson: string }): Fact {
	return wholeFactOf({
		draft: factDraft({
			question: 'which method read the information of an element',
			subject: {
				package: DIALECTE_PACKAGE,
				tags: [],
				attributes: [],
				codes: [],
				methods: [],
			},
			kind: 'method',
			answer: { verdict: 'value', value: INFO_METHOD_PATH, text: 'Use doc.query.info.of.' },
			source: 'dialecte',
			sources: [{ kind: 'dialecte', package: DIALECTE_PACKAGE, apiJson: params.apiJson }],
		}),
	})
}

type CheckRow = {
	fact: () => Fact
	setup: () => AskSetup
	expected: object
}

function plainSetup(params: {
	dialecte: LoadedDialecte
	baseCheck?: AskSetup['baseCheck']
}): AskSetup {
	return setupOf({ ...params, factsFolder: newFactsFolder() })
}

describe('ladderCheckOf: a source whose hash moved is checked again by its rung (D9)', () => {
	const rows: Record<string, CheckRow> = {
		'a schema source whose hash is the installed one: valid': {
			fact: () => schemaFact({ hash: definitionHash({ config: dialecte.config }) }),
			setup: () => plainSetup({ dialecte }),
			expected: { state: 'valid' },
		},
		'a schema source whose hash moved, rung 1 answering differently: stale': {
			fact: () => schemaFact({ hash: OLD_HASH }),
			setup: () => plainSetup({ dialecte: movedDifferentDialecte({ dialecte }) }),
			expected: { state: 'stale', reason: expect.stringMatching(/\S/) },
		},
		'a Dialecte source whose catalogue hash is the current one: valid': {
			fact: () => codeFact({ catalogue: CATALOGUE_HASH }),
			setup: () => plainSetup({ dialecte }),
			expected: { state: 'valid' },
		},
		'a Dialecte source whose catalogue hash moved, rung 2 answering the same: valid, the sources rewritten':
			{
				fact: () => codeFact({ catalogue: OLD_HASH }),
				setup: () => plainSetup({ dialecte }),
				expected: {
					state: 'valid',
					sources: [expect.objectContaining({ kind: 'dialecte', catalogue: CATALOGUE_HASH })],
				},
			},
		'a Dialecte source whose catalogue hash moved, rung 2 answering differently: stale': {
			fact: () => codeFact({ catalogue: OLD_HASH }),
			setup: () =>
				setupOf({ dialecte, factsFolder: newFactsFolder(), catalogues: CHANGED_CATALOGUES }),
			expected: { state: 'stale', reason: expect.stringMatching(/\S/) },
		},
		'a method fact whose api index hash is the current one: valid': {
			fact: () => methodFact({ apiJson: API_INDEX_HASH }),
			setup: () => plainSetup({ dialecte }),
			expected: { state: 'valid' },
		},
		'a method fact whose api index hash moved, rung 2 answering the same: valid, the sources rewritten':
			{
				fact: () => methodFact({ apiJson: OLD_HASH }),
				setup: () => plainSetup({ dialecte }),
				expected: {
					state: 'valid',
					sources: [expect.objectContaining({ kind: 'dialecte', apiJson: API_INDEX_HASH })],
				},
			},
		'a method fact whose api index hash moved, rung 2 answering differently: stale': {
			fact: () => methodFact({ apiJson: OLD_HASH }),
			setup: () =>
				setupOf({
					dialecte,
					factsFolder: newFactsFolder(),
					apiIndex: apiIndexOf({
						rows: [{ path: 'doc.query.other', intent: 'read the information of an element' }],
					}),
				}),
			expected: { state: 'stale', reason: expect.stringMatching(/\S/) },
		},
		'a standard source: the base check says (here stale, with its reason)': {
			fact: () => wholeFactOf(),
			setup: () => plainSetup({ dialecte, baseCheck: () => STANDARD_STALE }),
			expected: STANDARD_STALE,
		},
	}

	for (const [name, row] of Object.entries(rows))
		it(`${name}`, () => {
			expect(ladderCheckOf({ setup: row.setup() })({ fact: row.fact() })).toMatchObject(
				row.expected,
			)
		})

	it('a schema source whose hash moved, rung 1 answering the same: valid, the sources rewritten', () => {
		expect(
			ladderCheckOf({ setup: plainSetup({ dialecte: movedSameDialecte({ dialecte }) }) })({
				fact: schemaFact({ hash: OLD_HASH }),
			}),
		).toMatchObject({
			state: 'valid',
			sources: [
				{
					kind: 'schema',
					package: DIALECTE_PACKAGE,
					version: DIALECTE_VERSION,
					definitionHash: definitionHash({
						config: movedSameDialecte({ dialecte }).config,
					}),
				},
			],
		})
	})
})
