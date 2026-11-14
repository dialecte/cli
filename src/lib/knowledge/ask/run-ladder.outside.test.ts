import { CROWDED_METHOD_ROWS } from '../../../../test/ask-ladder-fixtures.constants.ts'
import {
	apiIndexOf,
	documentsOf,
	folderEntriesOf,
	newFactsFolder,
	requestOf,
	setupOf,
} from '../../../../test/ask-ladder-fixtures.ts'
import { loadMultiDeclaredDialecte } from '../../../../test/multi-declared-dialecte.ts'
import { OUTSIDE_STANDARD } from '../../../../test/standard-selection.constants.ts'
import { thrownBy } from '../../../../test/thrown-by.ts'
import { runLadder } from './run-ladder.ts'

import { beforeAll, describe, expect, it } from 'vitest'

import type { LoadedDialecte } from '../../schema/schema.types.ts'
import type { AskRequest, AskStandard } from './ask.types.ts'

let dialecte: LoadedDialecte

beforeAll(async () => {
	dialecte = await loadMultiDeclaredDialecte()
})

type OutcomeRow = {
	request: Partial<AskRequest>
	standard: AskStandard
	expected: object
}

describe('runLadder: no documents -> rung 3 is skipped; outside readers or the person (D14, case 32g)', () => {
	const rows: Record<string, OutcomeRow> = {
		'32g no documents, a semantic question: needs-readers, source outside, no slices': {
			request: { question: 'Explain the intent of AA_1' },
			standard: OUTSIDE_STANDARD,
			expected: { rung: 2, state: 'needs-readers', source: 'outside', answer: null, slices: [] },
		},
		'32g no documents: the angles of rungs 1-2 are kept for the outside readers': {
			request: { question: 'Explain the intent of AA_1' },
			standard: OUTSIDE_STANDARD,
			expected: {
				source: 'outside',
				angles: expect.arrayContaining([expect.objectContaining({ id: 'a1', family: 'subject' })]),
			},
		},
		'32g no documents, a decision: needs-readers, source outside': {
			request: { question: 'children of AA_1', decision: true },
			standard: OUTSIDE_STANDARD,
			expected: { rung: 2, state: 'needs-readers', source: 'outside', decision: true, slices: [] },
		},
		'D14 --no-standard without documents: the outside route as with none': {
			request: { question: 'Explain the intent of AA_1', noStandard: true },
			standard: OUTSIDE_STANDARD,
			expected: { state: 'needs-readers', source: 'outside', slices: [] },
		},
		'D14 --person-only without documents: needs-person after rung 2, no source': {
			request: { question: 'Explain the intent of AA_1', personOnly: true },
			standard: OUTSIDE_STANDARD,
			expected: { rung: 2, state: 'needs-person', source: null, answer: null, slices: [] },
		},
		'D14 --person-only with documents: needs-person after rung 2, rung 3 not run': {
			request: { question: 'Explain the intent of AA_1', personOnly: true },
			standard: documentsOf(),
			expected: { rung: 2, state: 'needs-person', source: null, answer: null, slices: [] },
		},
		'rung 3 with documents: needs-readers, source documents': {
			request: { question: 'Explain the intent of AA_1' },
			standard: documentsOf(),
			expected: { rung: 3, state: 'needs-readers', source: 'documents' },
		},
	}

	for (const [name, row] of Object.entries(rows))
		it(`${name}`, () => {
			expect(
				runLadder({
					request: requestOf(row.request),
					setup: setupOf({ dialecte, factsFolder: newFactsFolder(), standard: row.standard }),
					ask: 'A-0001',
					lot: null,
				}),
			).toMatchObject(row.expected)
		})

	it('no documents: the angles are the families computed without an index, never definitions, clauses or tables', () => {
		expect(
			runLadder({
				request: requestOf({ question: 'Explain the intent of AA_1' }),
				setup: setupOf({
					dialecte,
					factsFolder: newFactsFolder(),
					standard: OUTSIDE_STANDARD,
				}),
				ask: 'A-0001',
				lot: null,
			}).angles.map((angle) => angle.family),
		).toEqual(expect.not.arrayContaining(['definitions', 'clauses', 'tables']))
		expect(
			runLadder({
				request: requestOf({ question: 'Explain the intent of AA_1' }),
				setup: setupOf({
					dialecte,
					factsFolder: newFactsFolder(),
					standard: OUTSIDE_STANDARD,
				}),
				ask: 'A-0001',
				lot: null,
			}).angles.map((angle) => angle.family),
		).toEqual(expect.arrayContaining(['subject']))
	})

	it('no documents: the methods rung 2 listed stay on the outcome for the outside readers', () => {
		expect(
			runLadder({
				request: requestOf({ question: 'which method read beta of an element' }),
				setup: setupOf({
					dialecte,
					factsFolder: newFactsFolder(),
					standard: OUTSIDE_STANDARD,
					apiIndex: apiIndexOf({ rows: CROWDED_METHOD_ROWS }),
				}),
				ask: 'A-0001',
				lot: null,
			}),
		).toMatchObject({
			source: 'outside',
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

describe('runLadder: rung 1 wins over the outside route (32g)', () => {
	const rows: Record<string, Partial<AskRequest>> = {
		'a structural question rung 1 answers, no documents -> answered at rung 1, never outside': {},
		'--person-only on a structural question rung 1 answers -> answered at rung 1': {
			personOnly: true,
		},
	}

	for (const [name, changes] of Object.entries(rows))
		it(`${name}`, () => {
			expect(
				runLadder({
					request: requestOf({ question: 'children of AA_1', ...changes }),
					setup: setupOf({
						dialecte,
						factsFolder: newFactsFolder(),
						standard: OUTSIDE_STANDARD,
					}),
					ask: 'A-0001',
					lot: null,
				}),
			).toMatchObject({ rung: 1, state: 'answered', source: null, answer: { verdict: 'value' } })
		})
})

describe('runLadder: --no-standard while documents exist for the dialecte is refused (D14, rev 10)', () => {
	it('--no-standard with documents -> an AskRefusal naming the folder', () => {
		expect(
			thrownBy(() =>
				runLadder({
					request: requestOf({ question: 'Explain the intent of AA_1', noStandard: true }),
					setup: setupOf({
						dialecte,
						factsFolder: newFactsFolder(),
						standard: documentsOf(),
					}),
					ask: 'A-0001',
					lot: null,
				}),
			),
		).toMatchObject({
			name: 'AskRefusal',
			message: expect.stringContaining('example-0000'),
		})
	})

	it('--no-standard with documents -> the refusal says the outside readers run only when the documents cannot answer, nothing is written', () => {
		const folder = newFactsFolder()

		expect(
			thrownBy(() =>
				runLadder({
					request: requestOf({ question: 'children of AA_1', noStandard: true }),
					setup: setupOf({ dialecte, factsFolder: folder, standard: documentsOf() }),
					ask: 'A-0001',
					lot: null,
				}),
			),
		).toMatchObject({ name: 'AskRefusal', message: expect.stringContaining('outside') })
		expect(folderEntriesOf({ folder })).toEqual([])
	})
})
