import { join } from 'node:path'

import { writeAskFolder } from '../../../../test/ask-records-fixtures.ts'
import { temporaryFolder } from '../../../../test/scratch-repository.ts'
import { askStateOf } from './ask-state-of.ts'

import { describe, expect, it } from 'vitest'

import type { AskFolderSpec } from '../../../../test/ask-records-fixtures.types.ts'
import type { AskStateRead } from './ask.types.ts'

type StateRow = { spec: Omit<AskFolderSpec, 'ask'>; expected: AskStateRead }

const ROWS: Record<string, StateRow> = {
	'an ask that needs readers on the documents -> needs-readers, no fact, documents, not confirmed':
		{
			spec: { json: { state: 'needs-readers', rung: 3, source: 'documents', fact: null } },
			expected: { state: 'needs-readers', fact: null, source: 'documents', confirmed: false },
		},
	'an ask answered at rung 1 -> answered with its fact, no source': {
		spec: { json: { state: 'answered', rung: 1, source: null, fact: 'F-0001' } },
		expected: { state: 'answered', fact: 'F-0001', source: null, confirmed: false },
	},
	'a person-only ask (rung 2, needs-person, no source) -> needs-person, no source': {
		spec: { json: { state: 'needs-person', rung: 2, source: null, fact: null } },
		expected: { state: 'needs-person', fact: null, source: null, confirmed: false },
	},
	'a round whose verdict says needs-adjudicator -> needs-adjudicator, the documents still the source':
		{
			spec: { verdicts: [{ round: 1, state: 'needs-adjudicator', fact: null }] },
			expected: { state: 'needs-adjudicator', fact: null, source: 'documents', confirmed: false },
		},
	'round 1 asked for another and round 2 answered -> answered with the fact of round 2': {
		spec: {
			verdicts: [
				{ round: 1, state: 'needs-readers', fact: null },
				{ round: 2, state: 'answered', fact: 'F-0003' },
			],
		},
		expected: { state: 'answered', fact: 'F-0003', source: 'documents', confirmed: false },
	},
	'round 10 comes after round 2, not before it': {
		spec: {
			verdicts: [
				{ round: 2, state: 'needs-readers', fact: null },
				{ round: 10, state: 'needs-person', fact: null },
			],
		},
		expected: { state: 'needs-person', fact: null, source: 'documents', confirmed: false },
	},
	'a person answered after the rounds -> answered with the fact of the answer, not confirmed (documents)':
		{
			spec: {
				verdicts: [{ round: 1, state: 'needs-person', fact: null }],
				answer: { fact: 'F-0004' },
			},
			expected: { state: 'answered', fact: 'F-0004', source: 'documents', confirmed: false },
		},
	'an outside ask whose readers agreed -> answered, outside, not confirmed': {
		spec: {
			json: { source: 'outside', rung: 2 },
			verdicts: [{ round: 1, state: 'answered', fact: 'F-0002' }],
		},
		expected: { state: 'answered', fact: 'F-0002', source: 'outside', confirmed: false },
	},
	'an outside ask whose readers did not agree -> needs-person, outside, not confirmed': {
		spec: {
			json: { source: 'outside', rung: 2 },
			verdicts: [{ round: 1, state: 'needs-person', fact: null }],
		},
		expected: { state: 'needs-person', fact: null, source: 'outside', confirmed: false },
	},
	'an outside ask a person answered -> answered, outside, confirmed': {
		spec: {
			json: { source: 'outside', rung: 2 },
			verdicts: [{ round: 1, state: 'needs-person', fact: null }],
			answer: { fact: 'F-0005' },
		},
		expected: { state: 'answered', fact: 'F-0005', source: 'outside', confirmed: true },
	},
}

describe('askStateOf: the latest of ask.json, the rounds and the answer (D6)', () => {
	it.each(Object.entries(ROWS))('%s', (_title, row) => {
		const asksFolder = join(temporaryFolder('dialecte-ask-state-'), 'asks')
		writeAskFolder({ asksFolder, spec: { ask: 'A-0001', ...row.spec } })

		expect(askStateOf({ askFolder: join(asksFolder, 'A-0001') })).toEqual(row.expected)
	})
})
