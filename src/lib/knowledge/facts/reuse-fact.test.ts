import { join } from 'node:path'

import { keyOfDraft } from '../../../../test/fact-check-fixtures.ts'
import { factDraft, readFactFile, writeFactFile } from '../../../../test/fact-fixtures.ts'
import { temporaryFolder } from '../../../../test/scratch-repository.ts'
import { recordFact } from './record-fact.ts'
import { reuseFact } from './reuse-fact.ts'

import { describe, expect, it } from 'vitest'

import type {
	CheckOutcome,
	FactDraft,
	FactEffort,
	FactStoredState,
	FactViewState,
} from './facts.types.ts'

const NOW = new Date('2026-11-11T10:00:00.000Z')

/** One row of the reuse rule (D11): the key's current fact, what the check says, the effort asked, the result. */
type ReuseRow = {
	/** The current fact; none when the key holds no fact. */
	draft?: FactDraft
	/** The state the fact's file is rewritten to after its record. */
	storedState?: FactStoredState
	check?: CheckOutcome
	asked: FactEffort
	expected: 'answer' | 'candidate' | 'neither'
	/** The state the view of the answer or candidate says (`valid` when left out). */
	viewState?: FactViewState
	/** The reason the view carries (none when left out). */
	reason?: string
}

const OUTSIDE_SOURCES = [{ kind: 'outside', url: 'https://example.com' }]

describe('reuseFact: the current fact answers, is a candidate, or is neither (D11)', () => {
	const rows: Record<string, ReuseRow> = {
		'valid high, asked medium → the answer': {
			draft: factDraft({ effort: 'high' }),
			asked: 'medium',
			expected: 'answer',
		},
		'valid medium, asked medium → the answer': {
			draft: factDraft({ effort: 'medium' }),
			asked: 'medium',
			expected: 'answer',
		},
		'valid medium, asked high → no answer, a candidate': {
			draft: factDraft({ effort: 'medium' }),
			asked: 'high',
			expected: 'candidate',
			viewState: 'valid',
		},
		'a valid person fact (low effort), asked high → the answer': {
			draft: factDraft({ source: 'person', sources: [], effort: 'low' }),
			asked: 'high',
			expected: 'answer',
		},
		'a valid person fact with unchecked: true, asked high → the answer (D11b)': {
			draft: factDraft({ source: 'person', sources: [], unchecked: true, effort: 'low' }),
			asked: 'high',
			expected: 'answer',
		},
		'stale → a candidate': {
			draft: factDraft({ effort: 'high' }),
			storedState: 'stale',
			asked: 'low',
			expected: 'candidate',
			viewState: 'stale',
		},
		'the check says unverifiable → a candidate whose view says unverifiable and why': {
			draft: factDraft({ effort: 'high' }),
			check: {
				state: 'unverifiable',
				reason: 'standard example-0000 cannot be compared: fix the root',
			},
			asked: 'low',
			expected: 'candidate',
			viewState: 'unverifiable',
			reason: 'standard example-0000 cannot be compared: fix the root',
		},
		'outside, unchecked → a candidate': {
			draft: factDraft({ source: 'outside', sources: OUTSIDE_SOURCES, effort: 'high' }),
			asked: 'low',
			expected: 'candidate',
			viewState: 'unchecked',
		},
		'forgotten → neither': {
			draft: factDraft({ effort: 'high' }),
			storedState: 'forgotten',
			asked: 'low',
			expected: 'neither',
		},
		'no fact → neither': { asked: 'low', expected: 'neither' },
	}

	for (const [name, row] of Object.entries(rows))
		it(name, () => {
			const folder = temporaryFolder('facts-reuse-')
			const draft = row.draft ?? factDraft()
			if (row.draft !== undefined) {
				recordFact({ folder, draft: row.draft, now: () => NOW })
				if (row.storedState !== undefined)
					writeFactFile({
						folder,
						fact: { ...readFactFile({ folder, id: 'F-0001' }), state: row.storedState },
					})
			}
			const check = row.check === undefined ? undefined : () => row.check as CheckOutcome

			const stored = row.draft === undefined ? undefined : readFactFile({ folder, id: 'F-0001' })
			const view = {
				id: 'F-0001',
				path: join(folder, 'F-0001.json'),
				fact: stored,
				state: row.viewState ?? 'valid',
				current: true,
				...(row.reason === undefined ? {} : { reason: row.reason }),
			}
			expect(reuseFact({ folder, key: keyOfDraft(draft), effort: row.asked, check })).toEqual({
				answer: row.expected === 'answer' ? view : undefined,
				candidates: row.expected === 'candidate' && stored !== undefined ? [view] : [],
			})
		})
})
