import {
	movedDifferentDialecte,
	movedSameDialecte,
	newFactsFolder,
	requestOf,
	setupOf,
} from '../../../../test/ask-ladder-fixtures.ts'
import { readFactFile, readHistoryFile } from '../../../../test/fact-fixtures.ts'
import { loadMultiDeclaredDialecte } from '../../../../test/multi-declared-dialecte.ts'
import { definitionHash } from '../../schema/definition-hash.ts'
import { runLadder } from './run-ladder.ts'

import { beforeAll, describe, expect, it } from 'vitest'

import type { LoadedDialecte } from '../../schema/schema.types.ts'

let dialecte: LoadedDialecte

beforeAll(async () => {
	dialecte = await loadMultiDeclaredDialecte()
})

describe('runLadder: a schema fact whose definition moved is checked again by rung 1 (D9, case 19)', () => {
	it('rung 1 answering the same -> the fact stays the key current one, valid, its sources the new hash', () => {
		const folder = newFactsFolder()
		const moved = movedSameDialecte({ dialecte })

		expect(
			runLadder({
				request: requestOf(),
				setup: setupOf({ dialecte, factsFolder: folder }),
				ask: 'A-0001',
				lot: null,
			}),
		).toMatchObject({ rung: 1, fact: 'F-0001' })
		expect(
			runLadder({
				request: requestOf(),
				setup: setupOf({ dialecte: moved, factsFolder: folder }),
				ask: 'A-0002',
				lot: null,
			}),
		).toMatchObject({ rung: 0, state: 'answered', fact: 'F-0001' })
		expect(readFactFile({ folder, id: 'F-0001' })).toMatchObject({
			state: 'valid',
			supersededBy: null,
			sources: [{ kind: 'schema', definitionHash: definitionHash({ config: moved.config }) }],
		})
		expect(readHistoryFile({ folder, id: 'F-0001' })).toContainEqual(
			expect.objectContaining({ event: 'rechecked', fact: 'F-0001', ask: 'A-0002' }),
		)
	})

	it('rung 1 answering differently -> the old fact is stale and superseded by the new rung-1 fact', () => {
		const folder = newFactsFolder()

		expect(
			runLadder({
				request: requestOf(),
				setup: setupOf({ dialecte, factsFolder: folder }),
				ask: 'A-0001',
				lot: null,
			}),
		).toMatchObject({ rung: 1, fact: 'F-0001' })
		expect(
			runLadder({
				request: requestOf(),
				setup: setupOf({ dialecte: movedDifferentDialecte({ dialecte }), factsFolder: folder }),
				ask: 'A-0002',
				lot: null,
			}),
		).toMatchObject({
			rung: 1,
			state: 'answered',
			fact: 'F-0002',
			answer: { verdict: 'value', value: 'AAA_1, AAA_2' },
		})
		expect(readFactFile({ folder, id: 'F-0001' })).toMatchObject({
			state: 'stale',
			supersededBy: 'F-0002',
		})
		expect(readFactFile({ folder, id: 'F-0002' })).toMatchObject({
			state: 'valid',
			source: 'schema',
			supersedes: 'F-0001',
		})
		expect(readHistoryFile({ folder, id: 'F-0001' }).map((line) => line.event)).toEqual(
			expect.arrayContaining(['stale', 'superseded']),
		)
	})
})
