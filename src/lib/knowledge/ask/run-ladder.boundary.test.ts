import {
	BOUNDARY_CHILDREN_ANSWER,
	CONFLICT_KIND,
	DIALECTE_TAG_ITEM,
	NON_TAG_ITEM,
	PROSE_INSIDE_VALUE,
	PROSE_OUTSIDE_VALUE,
	PROSE_TEXT,
	REJECTED_ITEM,
	REQUIRED_ATTRIBUTE,
	REQUIRED_QUESTION,
	WILDCARD_CHILDREN_QUESTION,
} from '../../../../test/ask-boundary.constants.ts'
import { DIALECTE_PACKAGE } from '../../../../test/ask-ladder-fixtures.constants.ts'
import {
	childrenDraftOf,
	documentsOf,
	newFactsFolder,
	requestOf,
	setupOf,
} from '../../../../test/ask-ladder-fixtures.ts'
import { factDraft } from '../../../../test/fact-fixtures.ts'
import { loadMultiDeclaredDialecte } from '../../../../test/multi-declared-dialecte.ts'
import { recordFact } from '../facts/record-fact.ts'
import { runLadder } from './run-ladder.ts'

import { beforeAll, describe, expect, it } from 'vitest'

import type { LoadedDialecte } from '../../schema/schema.types.ts'
import type { FactDraft } from '../facts/facts.types.ts'

const NOW = new Date('2026-11-13T09:00:00.000Z')

let dialecte: LoadedDialecte

beforeAll(async () => {
	dialecte = await loadMultiDeclaredDialecte()
})

function recordInto(params: { folder: string; draft: FactDraft }): void {
	recordFact({ folder: params.folder, draft: params.draft, now: () => NOW })
}

function decisionRequest(changes: Parameters<typeof requestOf>[0] = {}) {
	return requestOf({ decision: true, ...changes })
}

function proseOf(params: { value: string }): FactDraft {
	return childrenDraftOf({
		answer: { verdict: 'value', value: params.value, text: PROSE_TEXT },
	})
}

describe('runLadder --decision: a stored schema fact is a candidate, the definition a boundary (D29)', () => {
	function storeSchemaFact(params: { folder: string }): void {
		runLadder({
			request: requestOf(),
			setup: setupOf({ dialecte, factsFolder: params.folder }),
			ask: 'A-0001',
			lot: null,
		})
	}

	it('a schema fact of the key and documents -> no rung-0 answer, the fact a candidate naming the boundary, the ladder on to rung 3', () => {
		const folder = newFactsFolder()
		storeSchemaFact({ folder })

		expect(
			runLadder({
				request: decisionRequest(),
				setup: setupOf({ dialecte, factsFolder: folder, standard: documentsOf() }),
				ask: 'A-0002',
				lot: null,
			}),
		).toMatchObject({
			rung: 3,
			state: 'needs-readers',
			answer: null,
			source: 'documents',
			candidates: [
				{ fact: 'F-0001', why: expect.stringMatching(/(?=.*definition)(?=.*boundary)/isu) },
			],
			boundary: {
				answer: BOUNDARY_CHILDREN_ANSWER,
				source: { kind: 'schema', package: DIALECTE_PACKAGE },
			},
			conflict: null,
		})
	})

	it('a schema fact of the key and no documents -> no answer, the outside route, the boundary shown', () => {
		const folder = newFactsFolder()
		storeSchemaFact({ folder })

		expect(
			runLadder({
				request: decisionRequest(),
				setup: setupOf({ dialecte, factsFolder: folder }),
				ask: 'A-0002',
				lot: null,
			}),
		).toMatchObject({
			state: 'needs-readers',
			answer: null,
			source: 'outside',
			candidates: [{ fact: 'F-0001' }],
			boundary: { answer: BOUNDARY_CHILDREN_ANSWER },
			conflict: null,
		})
	})
})

describe('runLadder --decision: prose inside the limit answers, the boundary shown (D29)', () => {
	const rows: Record<string, FactDraft> = {
		'a person fact whose list is a subset of the boundary': childrenDraftOf({
			source: 'person',
			sources: [],
			answer: { verdict: 'value', value: PROSE_INSIDE_VALUE, text: PROSE_TEXT },
		}),
		'a standard fact whose list is a subset of the boundary': proseOf({
			value: PROSE_INSIDE_VALUE,
		}),
		'a standard fact whose list is the boundary': proseOf({
			value: BOUNDARY_CHILDREN_ANSWER.value,
		}),
	}

	for (const [name, draft] of Object.entries(rows))
		it(`${name} -> rung 0, answered by that fact, boundary set, conflict null`, () => {
			const folder = newFactsFolder()
			recordInto({ folder, draft: { ...draft, effort: 'high' } })

			expect(
				runLadder({
					request: decisionRequest(),
					setup: setupOf({ dialecte, factsFolder: folder }),
					ask: 'A-0001',
					lot: null,
				}),
			).toMatchObject({
				rung: 0,
				state: 'answered',
				fact: 'F-0001',
				answer: { value: draft.answer.value },
				boundary: { answer: BOUNDARY_CHILDREN_ANSWER, source: { kind: 'schema' } },
				conflict: null,
			})
		})
})

describe('runLadder --decision: prose outside the limit, the definition wins and the ask flags a conflict (D29)', () => {
	it('a list naming an item the boundary does not hold -> answered, restricted to the boundary, conflict naming the fact and the rejected item', () => {
		const folder = newFactsFolder()
		recordInto({ folder, draft: { ...proseOf({ value: PROSE_OUTSIDE_VALUE }), effort: 'high' } })

		expect(
			runLadder({
				request: decisionRequest(),
				setup: setupOf({ dialecte, factsFolder: folder }),
				ask: 'A-0001',
				lot: null,
			}),
		).toMatchObject({
			rung: 0,
			state: 'answered',
			fact: 'F-0001',
			answer: { value: 'AAA_1' },
			boundary: { answer: BOUNDARY_CHILDREN_ANSWER },
			conflict: { kind: CONFLICT_KIND, fact: 'F-0001', outside: [REJECTED_ITEM] },
		})
	})

	it("a prose yes where the definition says yes is no conflict, a prose no is: answered with the boundary's own answer", () => {
		const folder = newFactsFolder()
		recordInto({
			folder,
			draft: factDraft({
				question: REQUIRED_QUESTION,
				subject: {
					package: DIALECTE_PACKAGE,
					tags: [{ tag: 'AA_1', parent: null }],
					attributes: [REQUIRED_ATTRIBUTE],
					codes: [],
					methods: [],
				},
				kind: 'required',
				answer: { verdict: 'no', value: REQUIRED_ATTRIBUTE, text: PROSE_TEXT },
				effort: 'high',
			}),
		})

		expect(
			runLadder({
				request: decisionRequest({ question: REQUIRED_QUESTION }),
				setup: setupOf({ dialecte, factsFolder: folder }),
				ask: 'A-0001',
				lot: null,
			}),
		).toMatchObject({
			rung: 0,
			state: 'answered',
			answer: { verdict: 'yes' },
			boundary: { answer: { verdict: 'yes' } },
			conflict: { kind: CONFLICT_KIND, fact: 'F-0001' },
		})
	})
})

describe('runLadder without --decision: nothing changes (D29)', () => {
	it('the same prose outside the limit -> answered as stored, boundary null, conflict null', () => {
		const folder = newFactsFolder()
		recordInto({ folder, draft: { ...proseOf({ value: PROSE_OUTSIDE_VALUE }), effort: 'high' } })

		expect(
			runLadder({
				request: requestOf(),
				setup: setupOf({ dialecte, factsFolder: folder }),
				ask: 'A-0001',
				lot: null,
			}),
		).toMatchObject({
			rung: 0,
			answer: { value: PROSE_OUTSIDE_VALUE },
			boundary: null,
			conflict: null,
		})
	})
})

describe('runLadder --decision: an element admitting any child reads its children boundary as open for foreign names (D31)', () => {
	const rows: Record<string, { value: string; conflict: unknown }> = {
		'a prose item that is no tag of the dialecte -> no conflict, answered': {
			value: NON_TAG_ITEM,
			conflict: null,
		},
		'a dialecte tag the declared children do not hold -> a conflict naming it': {
			value: DIALECTE_TAG_ITEM,
			conflict: { kind: CONFLICT_KIND, fact: 'F-0001', outside: [DIALECTE_TAG_ITEM] },
		},
	}

	for (const [name, row] of Object.entries(rows))
		it(name, () => {
			const folder = newFactsFolder()
			recordInto({
				folder,
				draft: childrenDraftOf({
					question: WILDCARD_CHILDREN_QUESTION,
					subject: {
						package: DIALECTE_PACKAGE,
						tags: [{ tag: 'AA_5', parent: null }],
						attributes: [],
						codes: [],
						methods: [],
					},
					answer: { verdict: 'value', value: row.value, text: PROSE_TEXT },
					effort: 'high',
				}),
			})

			expect(
				runLadder({
					request: decisionRequest({ question: WILDCARD_CHILDREN_QUESTION }),
					setup: setupOf({ dialecte, factsFolder: folder }),
					ask: 'A-0001',
					lot: null,
				}),
			).toMatchObject({ rung: 0, state: 'answered', fact: 'F-0001', conflict: row.conflict })
		})
})
