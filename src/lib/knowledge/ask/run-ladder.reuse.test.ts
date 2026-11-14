import { DIALECTE_VERSION } from '../../../../test/ask-ladder-fixtures.constants.ts'
import {
	childrenDraftOf,
	folderEntriesOf,
	newFactsFolder,
	requestOf,
	setupOf,
} from '../../../../test/ask-ladder-fixtures.ts'
import { keyOfDraft } from '../../../../test/fact-check-fixtures.ts'
import { readFactFile, readHistoryFile, readPointerText } from '../../../../test/fact-fixtures.ts'
import { loadMultiDeclaredDialecte } from '../../../../test/multi-declared-dialecte.ts'
import { definitionHash } from '../../schema/definition-hash.ts'
import { recordFact } from '../facts/record-fact.ts'
import { runLadder } from './run-ladder.ts'

import { beforeAll, describe, expect, it } from 'vitest'

import type { LoadedDialecte } from '../../schema/schema.types.ts'
import type { CheckOutcome, FactDraft, FactEffort } from '../facts/facts.types.ts'

const NOW = new Date('2026-11-13T09:00:00.000Z')
const CHILDREN_ANSWER = { verdict: 'value', value: 'AAA_1, AAA_2, AAA_3' }
const OUTSIDE_SOURCES = [{ kind: 'outside', url: 'https://example.com' }]
const ANYTHING = expect.stringMatching(/\S/)

let dialecte: LoadedDialecte

beforeAll(async () => {
	dialecte = await loadMultiDeclaredDialecte()
})

function recordInto(params: { folder: string; draft: FactDraft }): void {
	recordFact({ folder: params.folder, draft: params.draft, now: () => NOW })
}

type ReuseRow = {
	draft: Partial<FactDraft>
	asked: FactEffort
}

describe('runLadder rung 0: a valid fact of the key at the asked effort or above answers (D8, case 1)', () => {
	const rows: Record<string, ReuseRow> = {
		'a fact of high effort, asked at medium': { draft: { effort: 'high' }, asked: 'medium' },
		'a fact of the asked effort': { draft: { effort: 'medium' }, asked: 'medium' },
		'a person fact of low effort, asked at high (a person answer needs no effort)': {
			draft: { source: 'person', sources: [], effort: 'low' },
			asked: 'high',
		},
	}

	for (const [name, row] of Object.entries(rows))
		it(`${name} -> rung 0, answered, the fact's id and its answer`, () => {
			const folder = newFactsFolder()
			recordInto({ folder, draft: childrenDraftOf(row.draft) })

			expect(
				runLadder({
					request: requestOf({ effort: row.asked }),
					setup: setupOf({ dialecte, factsFolder: folder }),
					ask: 'A-0001',
					lot: null,
				}),
			).toMatchObject({
				rung: 0,
				state: 'answered',
				fact: 'F-0001',
				answer: CHILDREN_ANSWER,
				candidates: [],
			})
		})

	it('the answer is the fact reused: its history gains a reused line naming the ask and the lot', () => {
		const folder = newFactsFolder()
		recordInto({ folder, draft: childrenDraftOf({ effort: 'high' }) })

		expect(
			runLadder({
				request: requestOf(),
				setup: setupOf({ dialecte, factsFolder: folder }),
				ask: 'A-0007',
				lot: 'lot-a',
			}),
		).toMatchObject({ rung: 0, fact: 'F-0001' })
		expect(readHistoryFile({ folder, id: 'F-0001' }).map((line) => line.event)).toEqual([
			'created',
			'reused',
		])
		expect(readHistoryFile({ folder, id: 'F-0001' })[1]).toMatchObject({
			event: 'reused',
			fact: 'F-0001',
			ask: 'A-0007',
			lot: 'lot-a',
		})
	})
})

type CandidateRow = {
	draft: Partial<FactDraft>
	asked: FactEffort
	check?: CheckOutcome
	why: unknown
}

describe('runLadder rung 0: a fact that does not answer is a candidate and the ladder goes on (D8, cases 17, 32i)', () => {
	const rows: Record<string, CandidateRow> = {
		'17 a valid standard fact of low effort, asked at high': {
			draft: { effort: 'low' },
			asked: 'high',
			why: ANYTHING,
		},
		'a stale standard fact (its files moved)': {
			draft: {},
			asked: 'medium',
			check: { state: 'stale', reason: 'the files of the standard moved' },
			why: expect.stringContaining('the files of the standard moved'),
		},
		'32i an unchecked fact (an outside answer no document confirmed)': {
			draft: { source: 'outside', sources: OUTSIDE_SOURCES },
			asked: 'medium',
			why: ANYTHING,
		},
	}

	for (const [name, row] of Object.entries(rows))
		it(`${name} -> a candidate { fact, why }, never the answer; rung 1 then answers the resolved structural question and its new fact replaces the candidate`, () => {
			const folder = newFactsFolder()
			recordInto({ folder, draft: childrenDraftOf(row.draft) })

			expect(
				runLadder({
					request: requestOf({ effort: row.asked }),
					setup: setupOf({
						dialecte,
						factsFolder: folder,
						baseCheck: () => row.check ?? { state: 'valid' },
					}),
					ask: 'A-0001',
					lot: null,
				}),
			).toMatchObject({
				candidates: [{ fact: 'F-0001', why: row.why }],
				rung: 1,
				state: 'answered',
				answer: CHILDREN_ANSWER,
				fact: 'F-0002',
			})
		})
})

describe('runLadder: a rung-1 answer is recorded as a schema fact (D6, D7, case 3)', () => {
	const efforts: FactEffort[] = ['low', 'medium', 'high']

	for (const effort of efforts)
		it(`asked at ${effort} -> a schema fact of ${effort} effort holding the rung-1 sources`, () => {
			const folder = newFactsFolder()

			expect(
				runLadder({
					request: requestOf({ effort }),
					setup: setupOf({ dialecte, factsFolder: folder }),
					ask: 'A-0001',
					lot: null,
				}),
			).toMatchObject({ rung: 1, state: 'answered', fact: 'F-0001' })
			expect(readFactFile({ folder, id: 'F-0001' })).toMatchObject({
				source: 'schema',
				effort,
				kind: 'children',
				question: 'children of AA_1',
				answer: CHILDREN_ANSWER,
				sources: [
					{
						kind: 'schema',
						package: dialecte.packageName,
						version: DIALECTE_VERSION,
						definitionHash: definitionHash({ config: dialecte.config }),
					},
				],
			})
		})

	it('a later ask at a higher effort re-runs rung 1: its fact replaces the lower one (old superseded, the key points to the new)', () => {
		const folder = newFactsFolder()
		const setup = setupOf({ dialecte, factsFolder: folder })

		expect(
			runLadder({ request: requestOf({ effort: 'low' }), setup, ask: 'A-0001', lot: null }),
		).toMatchObject({ rung: 1, fact: 'F-0001' })
		expect(
			runLadder({ request: requestOf({ effort: 'high' }), setup, ask: 'A-0002', lot: null }),
		).toMatchObject({
			rung: 1,
			fact: 'F-0002',
			candidates: [{ fact: 'F-0001', why: ANYTHING }],
		})
		expect(readFactFile({ folder, id: 'F-0001' })).toMatchObject({ supersededBy: 'F-0002' })
		expect(readFactFile({ folder, id: 'F-0002' })).toMatchObject({
			effort: 'high',
			supersedes: 'F-0001',
		})
		expect(readPointerText({ folder, key: keyOfDraft(childrenDraftOf()) })).toBe('F-0002\n')
	})

	it('a second identical ask answers at rung 0 with that fact', () => {
		const folder = newFactsFolder()
		const setup = setupOf({ dialecte, factsFolder: folder })

		expect(runLadder({ request: requestOf(), setup, ask: 'A-0001', lot: null })).toMatchObject({
			rung: 1,
			fact: 'F-0001',
		})
		expect(runLadder({ request: requestOf(), setup, ask: 'A-0002', lot: null })).toMatchObject({
			rung: 0,
			state: 'answered',
			fact: 'F-0001',
			answer: CHILDREN_ANSWER,
		})
	})
})

describe('runLadder: noFacts skips rung 0 and writes nothing (D8, case 5)', () => {
	it('an empty folder: rung 1 answers, no fact id, the folder stays empty', () => {
		const folder = newFactsFolder()

		expect(
			runLadder({
				request: requestOf({ noFacts: true }),
				setup: setupOf({ dialecte, factsFolder: folder }),
				ask: 'A-0001',
				lot: null,
			}),
		).toMatchObject({ rung: 1, state: 'answered', fact: null })
		expect(folderEntriesOf({ folder })).toEqual([])
	})

	it('a valid fact of the key is not reused, and the facts folder is left as it was', () => {
		const folder = newFactsFolder()
		recordInto({ folder, draft: childrenDraftOf({ effort: 'high' }) })
		const before = folderEntriesOf({ folder })

		expect(
			runLadder({
				request: requestOf({ noFacts: true }),
				setup: setupOf({ dialecte, factsFolder: folder }),
				ask: 'A-0001',
				lot: null,
			}),
		).toMatchObject({ rung: 1, fact: null, candidates: [] })
		expect(folderEntriesOf({ folder })).toEqual(before)
		expect(readHistoryFile({ folder, id: 'F-0001' }).map((line) => line.event)).toEqual(['created'])
	})
})
