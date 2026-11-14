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

/** The current fact of the key, what is done to it and to its check, the effort asked. */
type ReuseSetup = {
	/** The current fact; none when the key holds no fact. */
	draft?: FactDraft
	/** The state the fact's file is rewritten to after its record. */
	storedState?: FactStoredState
	check?: CheckOutcome
	asked: FactEffort
}

/** One row of a reuse case: its setup, and the view state and reason the answer or candidate says. */
type ReuseRow = ReuseSetup & {
	/** The state the view of the answer or candidate says (`valid` when left out). */
	viewState?: FactViewState
	/** The reason the view carries (none when left out). */
	reason?: string
}

const OUTSIDE_SOURCES = [{ kind: 'outside', url: 'https://example.com' }]

/** Records the current fact of a setup, runs the reuse rule, and builds the view the current fact would show. */
function runReuse(parameters: { setup: ReuseSetup; viewState?: FactViewState; reason?: string }) {
	const { setup, viewState, reason } = parameters
	const folder = temporaryFolder('facts-reuse-')
	const draft = setup.draft ?? factDraft()
	if (setup.draft !== undefined) {
		recordFact({ folder, draft: setup.draft, now: () => NOW })
		if (setup.storedState !== undefined)
			writeFactFile({
				folder,
				fact: { ...readFactFile({ folder, id: 'F-0001' }), state: setup.storedState },
			})
	}
	const check = setup.check === undefined ? undefined : () => setup.check as CheckOutcome

	const stored = setup.draft === undefined ? undefined : readFactFile({ folder, id: 'F-0001' })
	const view = {
		id: 'F-0001',
		path: join(folder, 'F-0001.json'),
		fact: stored,
		state: viewState ?? 'valid',
		current: true,
		...(reason === undefined ? {} : { reason }),
	}
	const result = reuseFact({ folder, key: keyOfDraft(draft), effort: setup.asked, check })
	return { result, view, stored }
}

describe('reuseFact: the current fact answers, is a candidate, or is neither (D11)', () => {
	const answerRows: Record<string, ReuseSetup> = {
		'valid high, asked medium → the answer': {
			draft: factDraft({ effort: 'high' }),
			asked: 'medium',
		},
		'valid medium, asked medium → the answer': {
			draft: factDraft({ effort: 'medium' }),
			asked: 'medium',
		},
		'a valid person fact (low effort), asked high → the answer': {
			draft: factDraft({ source: 'person', sources: [], effort: 'low' }),
			asked: 'high',
		},
		'a valid person fact with unchecked: true, asked high → the answer (D11b)': {
			draft: factDraft({ source: 'person', sources: [], unchecked: true, effort: 'low' }),
			asked: 'high',
		},
	}

	const candidateRows: Record<string, ReuseRow> = {
		'valid medium, asked high → no answer, a candidate': {
			draft: factDraft({ effort: 'medium' }),
			asked: 'high',
			viewState: 'valid',
		},
		'stale → a candidate': {
			draft: factDraft({ effort: 'high' }),
			storedState: 'stale',
			asked: 'low',
			viewState: 'stale',
		},
		'the check says unverifiable → a candidate whose view says unverifiable and why': {
			draft: factDraft({ effort: 'high' }),
			check: {
				state: 'unverifiable',
				reason: 'standard example-0000 cannot be compared: fix the root',
			},
			asked: 'low',
			viewState: 'unverifiable',
			reason: 'standard example-0000 cannot be compared: fix the root',
		},
		'outside, unchecked → a candidate': {
			draft: factDraft({ source: 'outside', sources: OUTSIDE_SOURCES, effort: 'high' }),
			asked: 'low',
			viewState: 'unchecked',
		},
	}

	const neitherRows: Record<string, ReuseSetup> = {
		'forgotten → neither': {
			draft: factDraft({ effort: 'high' }),
			storedState: 'forgotten',
			asked: 'low',
		},
		'no fact → neither': { asked: 'low' },
	}

	for (const [name, row] of Object.entries(answerRows))
		it(name, () => {
			const { result, view } = runReuse({ setup: row })

			expect(result).toEqual({ answer: view, candidates: [] })
		})

	for (const [name, row] of Object.entries(candidateRows))
		it(name, () => {
			const { result, view } = runReuse({
				setup: row,
				viewState: row.viewState,
				reason: row.reason,
			})

			expect(result).toEqual({ answer: undefined, candidates: [view] })
		})

	for (const [name, row] of Object.entries(neitherRows))
		it(name, () => {
			const { result } = runReuse({ setup: row })

			expect(result).toEqual({ answer: undefined, candidates: [] })
		})
})
