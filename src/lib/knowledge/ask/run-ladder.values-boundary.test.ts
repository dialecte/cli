import {
	CLOSED_VALUES_ATTRIBUTE,
	CLOSED_VALUES_OUTSIDE_ITEM,
	CLOSED_VALUES_PROSE,
	CLOSED_VALUES_QUESTION,
	CONFLICT_KIND,
	OPEN_VALUES_ATTRIBUTE,
	OPEN_VALUES_PROSE,
	OPEN_VALUES_QUESTION,
	PROSE_TEXT,
} from '../../../../test/ask-boundary.constants.ts'
import { DIALECTE_PACKAGE } from '../../../../test/ask-ladder-fixtures.constants.ts'
import { newFactsFolder, requestOf, setupOf } from '../../../../test/ask-ladder-fixtures.ts'
import { factDraft } from '../../../../test/fact-fixtures.ts'
import { loadMultiDeclaredDialecte } from '../../../../test/multi-declared-dialecte.ts'
import { recordFact } from '../facts/record-fact.ts'
import { runLadder } from './run-ladder.ts'

import { beforeAll, describe, expect, it } from 'vitest'

import type { LoadedDialecte } from '../../schema/schema.types.ts'
import type { FactDraft, FactSubjectTag } from '../facts/facts.types.ts'

const NOW = new Date('2026-11-13T09:00:00.000Z')

let dialecte: LoadedDialecte

beforeAll(async () => {
	dialecte = await loadMultiDeclaredDialecte()
})

function valuesDraftOf(params: {
	question: string
	tags: FactSubjectTag[]
	attribute: string
	value: string
}): FactDraft {
	return factDraft({
		question: params.question,
		subject: {
			package: DIALECTE_PACKAGE,
			tags: params.tags,
			attributes: [params.attribute],
			codes: [],
			methods: [],
		},
		kind: 'values',
		source: 'person',
		sources: [],
		answer: { verdict: 'value', value: params.value, text: PROSE_TEXT },
		effort: 'high',
	})
}

describe('runLadder --decision: the values boundary of an attribute (D32)', () => {
	it('an attribute with no enumeration: the boundary is open -> answered at rung 0 with the prose values, boundary set, conflict null', () => {
		const folder = newFactsFolder()
		recordFact({
			folder,
			draft: valuesDraftOf({
				question: OPEN_VALUES_QUESTION,
				tags: [{ tag: 'AA_1', parent: null }],
				attribute: OPEN_VALUES_ATTRIBUTE,
				value: OPEN_VALUES_PROSE,
			}),
			now: () => NOW,
		})

		expect(
			runLadder({
				request: requestOf({ decision: true, question: OPEN_VALUES_QUESTION }),
				setup: setupOf({ dialecte, factsFolder: folder }),
				ask: 'A-0001',
				lot: null,
			}),
		).toMatchObject({
			rung: 0,
			state: 'answered',
			fact: 'F-0001',
			answer: { value: OPEN_VALUES_PROSE },
			boundary: { answer: { verdict: 'value', value: '' }, source: { kind: 'schema' } },
			conflict: null,
		})
	})

	it('an attribute with an enumeration (regression pin): a prose value outside it -> a conflict naming the item', () => {
		const folder = newFactsFolder()
		recordFact({
			folder,
			draft: valuesDraftOf({
				question: CLOSED_VALUES_QUESTION,
				tags: [{ tag: 'A', parent: null }],
				attribute: CLOSED_VALUES_ATTRIBUTE,
				value: CLOSED_VALUES_PROSE,
			}),
			now: () => NOW,
		})

		expect(
			runLadder({
				request: requestOf({ decision: true, question: CLOSED_VALUES_QUESTION }),
				setup: setupOf({ dialecte, factsFolder: folder }),
				ask: 'A-0001',
				lot: null,
			}),
		).toMatchObject({
			rung: 0,
			state: 'answered',
			fact: 'F-0001',
			conflict: { kind: CONFLICT_KIND, fact: 'F-0001', outside: [CLOSED_VALUES_OUTSIDE_ITEM] },
		})
	})
})
