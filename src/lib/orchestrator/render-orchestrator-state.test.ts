import { renderOrchestratorState } from './render-orchestrator-state.ts'

import { describe, expect, it } from 'vitest'

import type { OrchestratorEvent, OrchestratorState } from './orchestrator.types.ts'

describe('renderOrchestratorState', () => {
	const CASES: Record<string, () => void> = {
		'whole state with records -> complete exact eight-section render with escaped controls and no injected lines':
			() => {
				const state: OrchestratorState = {
					schema: 1,
					workspace: { root: '/workspace', key: 'workspace-123456789abc' },
					updatedAt: '2026-11-26T09:00:00.000Z',
					lanes: [
						{
							name: 'cli\n\r\u0000\t\u001b\u007f\u009f\u202e## injected',
							repos: ['cli'],
							holds: [],
							owns: [],
							mode: 'running',
							plan: './plan.md',
							queue: [],
						},
					],
					lots: [],
					runs: [],
					runners: [],
					held: [],
					waitingOnYou: [],
					prs: [],
					next: [],
					seen: [],
				}
				const records: readonly OrchestratorEvent[] = [
					{
						schema: 1,
						id: 'event-a',
						at: '2026-11-26T09:01:00.000Z',
						kind: 'station',
						subject: 'lot-a',
						facts: { note: 'safe' },
					},
				]
				const expected = String.raw`Status: 0 runs, 0 waiting, 0 next

## Waiting on you
none

## Runners
none

## Lanes
- cli\u{a}\u{d}\u{0}\u{9}\u{1b}\u{7f}\u{9f}\u{202e}## injected: repos=cli; holds=none; owns=none; mode=running; plan=./plan.md; queue=none

## Lots in flight
none

## Held
none

## Next
none

## Recent
- 2026-11-26T09:01:00.000Z station lot-a event-a {"note":"safe"}
`

				expect(renderOrchestratorState({ state, records })).toBe(expected)
			},
		'whole state with committed, canceled and failed lots plus one working lot -> Lots in flight shows only the working lot and state JSON retains all four':
			() => {
				const state: OrchestratorState = {
					schema: 1,
					workspace: { root: '/workspace', key: 'workspace-123456789abc' },
					updatedAt: '2026-11-26T09:00:00.000Z',
					lanes: [],
					lots: [
						{
							id: 'committed-lot',
							lane: 'cli',
							repo: 'cli',
							state: 'committed',
							station: 'land',
							attempt: 1,
							pr: 'pr-1',
							head: 'committed-head',
						},
						{
							id: 'canceled-lot',
							lane: 'cli',
							repo: 'cli',
							state: 'canceled',
							station: 'stop',
							attempt: 1,
							pr: '',
							head: 'canceled-head',
						},
						{
							id: 'failed-lot',
							lane: 'cli',
							repo: 'cli',
							state: 'failed',
							station: 'gate',
							attempt: 1,
							pr: 'pr-2',
							head: 'failed-head',
						},
						{
							id: 'working-lot',
							lane: 'cli',
							repo: 'cli',
							state: 'working',
							station: 'test',
							attempt: 2,
							pr: 'pr-3',
							head: 'working-head',
						},
					],
					runs: [],
					runners: [],
					held: [],
					waitingOnYou: [],
					prs: [],
					next: [],
					seen: [],
				}
				const stateJson = JSON.stringify(state)
				const expected = `Status: 0 runs, 0 waiting, 0 next

## Waiting on you
none

## Runners
none

## Lanes
none

## Lots in flight
- working-lot: lane=cli; repo=cli; state=working; station=test; attempt=2; pr=pr-3; head=working-head

## Held
none

## Next
none

## Recent
none
`

				expect(renderOrchestratorState({ state, records: [] })).toBe(expected)
				expect(JSON.stringify(state)).toBe(stateJson)
				expect(JSON.parse(stateJson).lots).toHaveLength(4)
			},
	}

	it.each(Object.entries(CASES))('%s', (_title, run) => run())
})
