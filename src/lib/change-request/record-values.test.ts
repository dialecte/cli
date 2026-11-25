/**
 * The review and tests rows reach the body as the cli writes them: a row whose value is outside what its writer
 * writes (a severity, a state, a station, a verdict, a model word, a gate mode, a case status) is refused, naming its
 * record, before anything is sent.
 */
import { recordValueFault } from './record-values.ts'

import { describe, expect, it } from 'vitest'

import type { ChangeRequestSources } from './change-request.types.ts'

const TREE = 'a'.repeat(64)

/** Sources holding `review` and `tests` and nothing else. */
function sourcesWith(params: Pick<ChangeRequestSources, 'review' | 'tests'>): ChangeRequestSources {
	return {
		messages: ['feat(x): x'],
		treeHash: TREE,
		release: false,
		...params,
	}
}

const FINDING = {
	schema: 1 as const,
	kind: 'finding' as const,
	id: 'R1-1',
	round: 1,
	severity: 'nit',
	state: 'open',
}
const VERDICT = {
	schema: 1 as const,
	kind: 'verdict' as const,
	at: '2026-11-17T00:00:00Z',
	by: { kind: 'station' as const, station: 'reviewer', round: 1 },
	vendor: 'anthropic',
	model: 'claude-opus-5-5',
	verdict: 'approve',
}

describe('recordValueFault', () => {
	it.each([
		['rows the cli writes', {}, {}, undefined],
		[
			'a finding id that is no id',
			{ id: 'R1-1 see notes' },
			{},
			{ record: 'review.jsonl', field: 'id' },
		],
		[
			'a finding id that is a word, not a round id',
			{ id: 'CI2a' },
			{},
			{ record: 'review.jsonl', field: 'id' },
		],
		[
			'a severity outside the list',
			{ severity: 'urgent' },
			{},
			{ record: 'review.jsonl', field: 'severity' },
		],
		[
			'a state outside the list',
			{ state: 'shipped' },
			{},
			{ record: 'review.jsonl', field: 'state' },
		],
		[
			'a station that is no review station',
			{},
			{ by: { kind: 'station', station: 'planner' } },
			{ record: 'review.jsonl', field: 'station' },
		],
		[
			'a verdict outside the vocabulary',
			{},
			{ verdict: 'great' },
			{ record: 'review.jsonl', field: 'verdict' },
		],
		[
			'a vendor that is no word',
			{},
			{ vendor: 'a vendor' },
			{ record: 'review.jsonl', field: 'vendor' },
		],
		[
			'a model that is no word',
			{},
			{ model: 'see /x' },
			{ record: 'review.jsonl', field: 'model' },
		],
	])('%s → %j', (_name, finding, verdict, expected) => {
		const sources = sourcesWith({
			review: {
				findings: [{ ...FINDING, ...finding }],
				verdicts: [{ ...VERDICT, ...verdict } as typeof VERDICT],
			},
		})

		expect(recordValueFault(sources)).toEqual(expected)
	})

	it('a gate mode outside the modes → refused naming tests.json', () => {
		const sources = sourcesWith({
			tests: {
				schema: 1,
				gate: {
					mode: 'weird' as 'full',
					at: '',
					head: '',
					stateHash: TREE,
					tests: { passed: 1, failed: 0, skipped: 0, total: 1 },
				},
			},
		})

		expect(recordValueFault(sources)).toEqual({ record: 'tests.json', field: 'mode' })
	})

	it('a tdd count of a status tdd never writes → refused naming tests.json', () => {
		const sources = sourcesWith({
			tests: {
				schema: 1,
				tdd: {
					at: '',
					head: '',
					stateHash: TREE,
					cases: [],
					counts: { [`see ${'#'}1234`]: 1 } as Record<string, number>,
				},
			},
		})

		expect(recordValueFault(sources)).toEqual({ record: 'tests.json', field: 'status' })
	})

	it('a gate part whose ledger is no list → refused naming tests.json and the field', () => {
		const sources = sourcesWith({
			tests: {
				schema: 1,
				gate: {
					mode: 'full',
					at: '',
					head: '',
					stateHash: TREE,
					failures: {} as [],
				},
			},
		})

		expect(recordValueFault(sources)).toEqual({ record: 'tests.json', field: 'failures' })
	})
})
