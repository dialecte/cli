import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { renderOrchestratorState } from './render-orchestrator-state.ts'

import { describe, expect, it } from 'vitest'

import type { OrchestratorEvent, OrchestratorLot, OrchestratorState } from './orchestrator.types.ts'

/** A whole fixture state of `fixtures/<name>.json`. */
function fixtureState(name: string): OrchestratorState {
	return JSON.parse(
		readFileSync(join(import.meta.dirname, 'fixtures', `${name}.json`), 'utf8'),
	) as OrchestratorState
}

/** The render of `fixtures/<name>.json` without log records, or what the render threw. */
function fixtureRender(name: string): string {
	try {
		return renderOrchestratorState({ state: fixtureState(name), records: [] })
	} catch (error) {
		return `thrown: ${error instanceof Error ? error.message : String(error)}`
	}
}

const WORKING_LOT: OrchestratorLot = {
	id: 'working-lot',
	lane: 'cli',
	repo: 'cli',
	state: 'working',
	station: 'test',
	attempt: 2,
	pr: 'pr-3',
	head: 'working-head',
}

/** A state of no lane holding `lots`. */
function lotsState(lots: readonly OrchestratorLot[]): OrchestratorState {
	return {
		schema: 1,
		workspace: { root: '/workspace', key: 'workspace-123456789abc' },
		updatedAt: '2026-11-26T09:00:00.000Z',
		lanes: [],
		lots,
		runs: [],
		runners: [],
		held: [],
		waitingOnYou: [],
		prs: [],
		next: [],
		seen: [],
	}
}

const WORKING_ONLY_RENDER = `Status: 0 runs, 0 waiting, 0 next

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

describe('renderOrchestratorState', function renderorchestratorstate() {
	const CASES: Record<string, () => void> = {
		'whole state with records -> complete exact eight-section render with escaped controls and no injected lines':
			function wholeStateWithRecordsComplete() {
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
	}

	it.each(Object.entries(CASES))('%s', function runsCase(_title, run) {
		run()
	})
})

describe('renderOrchestratorState, a terminal lot left out of Lots in flight', function renderorchestratorstateATerminalLotLeft() {
	const TERMINAL_CASES: Record<string, { state: OrchestratorLot['state'] }> = {
		'a committed lot beside a working one -> Lots in flight shows only the working lot': {
			state: 'committed',
		},
		'a canceled lot beside a working one -> Lots in flight shows only the working lot': {
			state: 'canceled',
		},
		'a failed lot beside a working one -> Lots in flight shows only the working lot': {
			state: 'failed',
		},
	}

	it.each(Object.entries(TERMINAL_CASES))('%s', function checksCase(_title, testCase) {
		const terminal: OrchestratorLot = {
			...WORKING_LOT,
			id: `${testCase.state}-lot`,
			state: testCase.state,
		}

		expect(
			renderOrchestratorState({ state: lotsState([terminal, WORKING_LOT]), records: [] }),
		).toBe(WORKING_ONLY_RENDER)
	})
})

describe('renderOrchestratorState, the whole fixtures', function renderorchestratorstateTheWholeFixtures() {
	const FIXTURE_CASES: Record<string, { name: string; expected: string }> = {
		'waiting fixture -> its gate and runs, the committed lot kept in state and left out of Lots in flight':
			{
				name: 'waiting',
				expected: `Status: 2 runs, 1 waiting, 1 next

## Waiting on you
- gate-status: kind=gate; text=Approve the status command before handover; line=dialecte orchestrate status; options=approve, hold

## Runners
- runner-a: available=true; until=none; tokensSinceReset=3200; usage=64%

## Lanes
- cli: repos=cli; holds=none; owns=lot-state, lot-status; mode=running; plan=plans/cli; queue=none; pin=lot-pin

## Lots in flight
- lot-state: lane=cli; repo=cli; state=working; station=test; attempt=1; pr=; head=head-state; run=runner-a/run-waiting-1
- lot-status: lane=cli; repo=cli; state=working; station=review; attempt=2; pr=pr-status; head=head-status; run=runner-a/run-waiting-2

## Held
none

## Next
- cli: lot-next

## Recent
none
`,
			},
		'runner-fallback fixture -> the unavailable runner, the run on the fallback runner, no person item':
			{
				name: 'runner-fallback',
				expected: `Status: 1 runs, 0 waiting, 0 next

## Waiting on you
none

## Runners
- runner-a: available=false; until=2026-11-26T11:00:00.000Z; tokensSinceReset=9800; usage=limit
- runner-b: available=true; until=none; tokensSinceReset=1200; usage=24%

## Lanes
- core: repos=core; holds=none; owns=lot-parser; mode=running; plan=plans/core; queue=none

## Lots in flight
- lot-parser: lane=core; repo=core; state=working; station=implement; attempt=1; pr=; head=head-parser; run=runner-b/run-fallback-1

## Held
none

## Next
none

## Recent
none
`,
			},
		'held fixture -> lanes held or paused, the held items, several next items': {
			name: 'held',
			expected: `Status: 0 runs, 0 waiting, 2 next

## Waiting on you
none

## Runners
- runner-a: available=true; until=none; tokensSinceReset=4100; usage=none

## Lanes
- cli: repos=cli, core; holds=release-window; owns=none; mode=hold; plan=plans/tooling; queue=lot-release
- copy-paste: repos=copy-paste; holds=none; owns=none; mode=paused; plan=plans/copy-paste; queue=none

## Lots in flight
none

## Held
- cli: by=user; since=2026-11-26T08:00:00.000Z; until=2026-11-27T08:00:00.000Z
- copy-paste: by=overlap; since=2026-11-25T16:00:00.000Z; until=none

## Next
- copy-paste: lot-docs
- cli: lot-release-next

## Recent
none
`,
		},
	}

	it.each(Object.entries(FIXTURE_CASES))('%s', function checksCase(_title, testCase) {
		expect(fixtureRender(testCase.name)).toBe(testCase.expected)
	})
})

describe('renderOrchestratorState, a lot still in flight is kept', function inFlightRows() {
	it('a ready lot and an input-required lot -> both kept in Lots in flight, in state order', function keepsInFlight() {
		const ready: OrchestratorLot = {
			...WORKING_LOT,
			id: 'ready-lot',
			state: 'ready',
			station: 'land',
		}
		const waiting: OrchestratorLot = {
			...WORKING_LOT,
			id: 'input-required-lot',
			state: 'input-required',
			station: 'review',
		}

		expect(renderOrchestratorState({ state: lotsState([ready, waiting]), records: [] })).toBe(
			WORKING_ONLY_RENDER.replace(
				'- working-lot: lane=cli; repo=cli; state=working; station=test; attempt=2; pr=pr-3; head=working-head',
				[
					'- ready-lot: lane=cli; repo=cli; state=ready; station=land; attempt=2; pr=pr-3; head=working-head',
					'- input-required-lot: lane=cli; repo=cli; state=input-required; station=review; attempt=2; pr=pr-3; head=working-head',
				].join('\n'),
			),
		)
	})
})
