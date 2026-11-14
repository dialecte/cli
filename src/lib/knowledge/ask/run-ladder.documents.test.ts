import {
	documentsOf,
	folderEntriesOf,
	newFactsFolder,
	requestOf,
	setupOf,
} from '../../../../test/ask-ladder-fixtures.ts'
import { loadMultiDeclaredDialecte } from '../../../../test/multi-declared-dialecte.ts'
import { SYNTHETIC_FILE_ID } from '../../../../test/synthetic-standard.constants.ts'
import { runLadder } from './run-ladder.ts'

import { beforeAll, describe, expect, it } from 'vitest'

import type { LoadedDialecte } from '../../schema/schema.types.ts'
import type { AskRequest } from './ask.types.ts'

let dialecte: LoadedDialecte

beforeAll(async () => {
	dialecte = await loadMultiDeclaredDialecte()
})

type DocumentsRow = {
	request: Partial<AskRequest>
	decision: boolean
}

describe('runLadder rung 3: nothing answered and documents exist -> angles and slices for the readers (case 6)', () => {
	const rows: Record<string, DocumentsRow> = {
		'6 decision: true on a resolved structural question: rung 1 never answers': {
			request: { question: 'children of AA_1', decision: true },
			decision: true,
		},
		'13 a tag declared two ways, no parent: unresolved, a decision': {
			request: { question: 'children of AAA_1' },
			decision: true,
		},
		'a semantic question about AA_1': {
			request: { question: 'Explain the intent of AA_1' },
			decision: false,
		},
	}

	for (const [name, row] of Object.entries(rows))
		it(`${name} -> rung 3, needs-readers, no answer, no fact written`, () => {
			const folder = newFactsFolder()

			expect(
				runLadder({
					request: requestOf(row.request),
					setup: setupOf({ dialecte, factsFolder: folder, standard: documentsOf() }),
					ask: 'A-0001',
					lot: null,
				}),
			).toMatchObject({
				rung: 3,
				state: 'needs-readers',
				decision: row.decision,
				answer: null,
				fact: null,
				angles: expect.arrayContaining([expect.objectContaining({ id: 'a1', family: 'subject' })]),
			})
			expect(folderEntriesOf({ folder })).toEqual([])
		})

	it('the slices hold the subject first: the lines naming AA_1, found by the first angle', () => {
		expect(
			runLadder({
				request: requestOf({ question: 'children of AA_1', decision: true }),
				setup: setupOf({ dialecte, factsFolder: newFactsFolder(), standard: documentsOf() }),
				ask: 'A-0001',
				lot: null,
			}).slices[0],
		).toMatchObject({
			id: 's1',
			file: SYNTHETIC_FILE_ID,
			from: 3,
			to: 3,
			clause: '1',
			angles: expect.arrayContaining(['a1']),
			linked: false,
		})
	})
})

describe('runLadder without documents: this step stops at rung 2', () => {
	it('a decision with no document and no rung-2 answer -> rung 2, needs-readers, no slices', () => {
		expect(
			runLadder({
				request: requestOf({ question: 'children of AA_1', decision: true }),
				setup: setupOf({ dialecte, factsFolder: newFactsFolder() }),
				ask: 'A-0001',
				lot: null,
			}),
		).toMatchObject({
			rung: 2,
			state: 'needs-readers',
			decision: true,
			answer: null,
			slices: [],
		})
	})
})
