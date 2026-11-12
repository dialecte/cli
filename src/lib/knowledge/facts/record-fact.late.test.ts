/** Late fix (R4-11): any checked fact (schema, Dialecte, standard) replaces the current unchecked one of its key. */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { keyOfDraft } from '../../../../test/fact-check-fixtures.ts'
import {
	factDraft,
	readFactFile,
	readHistoryFile,
	readPointerText,
} from '../../../../test/fact-fixtures.ts'
import { temporaryFolder } from '../../../../test/scratch-repository.ts'
import { recordFact } from './record-fact.ts'

import { describe, expect, it } from 'vitest'

import type { FactDraft } from './facts.types.ts'

const NOW = new Date('2026-11-11T10:00:00.000Z')
const SECOND_ANSWER = { verdict: 'no', value: null, text: 'D is optional in A.' }

/** One row: the current unchecked fact and the new checked draft, which replaces it whatever the efforts. */
type CheckedReplacementRow = {
	current: Partial<FactDraft>
	next: Partial<FactDraft>
}

describe('recordFact: a checked fact replaces a current unchecked one (R4-11)', () => {
	const rows: Record<string, CheckedReplacementRow> = {
		'current outside (unchecked) high, new schema low': {
			current: {
				source: 'outside',
				effort: 'high',
				sources: [{ kind: 'outside', url: 'https://example.com' }],
			},
			next: {
				source: 'schema',
				effort: 'low',
				sources: [
					{
						kind: 'schema',
						package: '@acme/widget',
						version: '1.0.0',
						definitionHash: 'sha256:aa',
					},
				],
			},
		},
		'current outside (unchecked) medium, new dialecte medium': {
			current: {
				source: 'outside',
				effort: 'medium',
				sources: [{ kind: 'outside', url: 'https://example.com' }],
			},
			next: {
				source: 'dialecte',
				effort: 'medium',
				sources: [{ kind: 'dialecte', package: '@acme/widget' }],
			},
		},
		'current person fact with unchecked: true, high, new schema medium': {
			current: { source: 'person', effort: 'high', sources: [], unchecked: true },
			next: {
				source: 'schema',
				effort: 'medium',
				sources: [
					{
						kind: 'schema',
						package: '@acme/widget',
						version: '1.0.0',
						definitionHash: 'sha256:aa',
					},
				],
			},
		},
	}

	for (const [name, row] of Object.entries(rows))
		it(`${name} → replaced`, () => {
			const folder = temporaryFolder('facts-late-checked-replaces-')
			const currentDraft = factDraft(row.current)
			recordFact({ folder, draft: currentDraft, lot: '0025', ask: 'q1', now: () => NOW })
			const oldBefore = readFactFile({ folder, id: 'F-0001' })

			const outcome = recordFact({
				folder,
				draft: factDraft({ answer: SECOND_ANSWER, ...row.next }),
				lot: '0025',
				ask: 'q2',
				now: () => NOW,
			})

			// a reuse writes no second file: the expectation below then fails as a red, not as a read error
			const replacement = existsSync(join(folder, 'F-0002.json'))
				? readFactFile({ folder, id: 'F-0002' })
				: undefined
			expect({
				outcome,
				pointer: readPointerText({ folder, key: keyOfDraft(currentDraft) }),
				replacement: {
					answer: replacement?.answer,
					supersedes: replacement?.supersedes,
					supersededBy: replacement?.supersededBy,
				},
				oldFact: readFactFile({ folder, id: 'F-0001' }),
				oldEvents: readHistoryFile({ folder, id: 'F-0001' }).map((line) => line.event),
				newEvents: readHistoryFile({ folder, id: 'F-0002' }).map((line) => line.event),
			}).toEqual({
				outcome: { outcome: 'replaced', id: 'F-0002', previous: 'F-0001' },
				pointer: 'F-0002\n',
				replacement: { answer: SECOND_ANSWER, supersedes: 'F-0001', supersededBy: null },
				oldFact: { ...oldBefore, supersededBy: 'F-0002' },
				oldEvents: ['created', 'superseded'],
				newEvents: ['created'],
			})
		})
})
