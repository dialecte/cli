import { pairRuns } from './pair-runs.ts'

import { describe, expect, it } from 'vitest'

import type { LotEvent } from './event.types.ts'

/** An event with a full envelope; the fields of its kind in `fields`. */
function event(params: { id: string; kind: string } & Record<string, unknown>): LotEvent {
	return {
		schema: 1,
		at: '2026-11-08T10:15:00.000Z',
		lot: '0171-scl-subscribe',
		by: 'host',
		pid: 100,
		cli: '0.4.0',
		simulated: false,
		hostEvent: null,
		...params,
	} as LotEvent
}

type Row = {
	name: string
	events: LotEvent[]
	expected: {
		runs: { run: string; start: string | undefined; end: string | undefined }[]
		kept: string[]
		duplicates: number
	}
}

const ROWS: Row[] = [
	{
		name: 'a start and its end of one run → one run holding both',
		events: [
			event({ id: 'ev-a', kind: 'station.start', run: 'run-1' }),
			event({ id: 'ev-b', kind: 'station.end', run: 'run-1' }),
		],
		expected: {
			runs: [{ run: 'run-1', start: 'ev-a', end: 'ev-b' }],
			kept: ['ev-a', 'ev-b'],
			duplicates: 0,
		},
	},
	{
		name: 'a start with no end → a run with no end, nothing counted',
		events: [event({ id: 'ev-a', kind: 'step.start', run: 'run-1' })],
		expected: {
			runs: [{ run: 'run-1', start: 'ev-a', end: undefined }],
			kept: ['ev-a'],
			duplicates: 0,
		},
	},
	{
		name: 'an end with no start → a run with no start, nothing counted',
		events: [event({ id: 'ev-b', kind: 'station.end', run: 'run-9' })],
		expected: {
			runs: [{ run: 'run-9', start: undefined, end: 'ev-b' }],
			kept: ['ev-b'],
			duplicates: 0,
		},
	},
	{
		name: 'two ends of one run → the first end kept, the second a duplicate',
		events: [
			event({ id: 'ev-a', kind: 'station.start', run: 'run-1' }),
			event({ id: 'ev-b', kind: 'station.end', run: 'run-1' }),
			event({ id: 'ev-c', kind: 'station.end', run: 'run-1' }),
		],
		expected: {
			runs: [{ run: 'run-1', start: 'ev-a', end: 'ev-b' }],
			kept: ['ev-a', 'ev-b'],
			duplicates: 1,
		},
	},
	{
		name: 'two runs interleaved → each paired with its own end',
		events: [
			event({ id: 'ev-a', kind: 'step.start', run: 'run-1' }),
			event({ id: 'ev-b', kind: 'step.start', run: 'run-2' }),
			event({ id: 'ev-c', kind: 'step.end', run: 'run-2' }),
			event({ id: 'ev-d', kind: 'step.end', run: 'run-1' }),
		],
		expected: {
			runs: [
				{ run: 'run-1', start: 'ev-a', end: 'ev-d' },
				{ run: 'run-2', start: 'ev-b', end: 'ev-c' },
			],
			kept: ['ev-a', 'ev-b', 'ev-c', 'ev-d'],
			duplicates: 0,
		},
	},
	{
		name: 'two events of one hostEvent → the first kept, the second a duplicate',
		events: [
			event({ id: 'ev-a', kind: 'station.end', run: 'run-1', hostEvent: 'h-7' }),
			event({ id: 'ev-b', kind: 'station.end', run: 'run-2', hostEvent: 'h-7' }),
		],
		expected: {
			runs: [{ run: 'run-1', start: undefined, end: 'ev-a' }],
			kept: ['ev-a'],
			duplicates: 1,
		},
	},
	{
		name: 'two events with a null hostEvent → both kept (null names nothing)',
		events: [
			event({ id: 'ev-a', kind: 'station.end', run: 'run-1' }),
			event({ id: 'ev-b', kind: 'station.end', run: 'run-2' }),
		],
		expected: {
			runs: [
				{ run: 'run-1', start: undefined, end: 'ev-a' },
				{ run: 'run-2', start: undefined, end: 'ev-b' },
			],
			kept: ['ev-a', 'ev-b'],
			duplicates: 0,
		},
	},
	{
		name: 'a second end of one run that also repeats its hostEvent → one duplicate, not two',
		events: [
			event({ id: 'ev-a', kind: 'station.end', run: 'run-1', hostEvent: 'h-7' }),
			event({ id: 'ev-b', kind: 'station.end', run: 'run-1', hostEvent: 'h-7' }),
		],
		expected: {
			runs: [{ run: 'run-1', start: undefined, end: 'ev-a' }],
			kept: ['ev-a'],
			duplicates: 1,
		},
	},
	{
		name: 'a folder event without a run → kept, opens no run, counts nothing',
		events: [event({ id: 'ev-a', kind: 'folder' }), event({ id: 'ev-b', kind: 'folder' })],
		expected: { runs: [], kept: ['ev-a', 'ev-b'], duplicates: 0 },
	},
	{
		name: 'a step.foreign event without a run → kept, opens no run, counts nothing',
		events: [
			event({ id: 'ev-a', kind: 'step.foreign' }),
			event({ id: 'ev-b', kind: 'step.foreign' }),
		],
		expected: { runs: [], kept: ['ev-a', 'ev-b'], duplicates: 0 },
	},
	{
		name: 'an ask.read event without a run → kept, opens no run, counts nothing',
		events: [event({ id: 'ev-a', kind: 'ask.read' }), event({ id: 'ev-b', kind: 'ask.read' })],
		expected: { runs: [], kept: ['ev-a', 'ev-b'], duplicates: 0 },
	},
	{
		name: 'a run-less event beside a paired run → the run is unchanged',
		events: [
			event({ id: 'ev-a', kind: 'step.start', run: 'run-1' }),
			event({ id: 'ev-f', kind: 'folder' }),
			event({ id: 'ev-b', kind: 'step.end', run: 'run-1' }),
		],
		expected: {
			runs: [{ run: 'run-1', start: 'ev-a', end: 'ev-b' }],
			kept: ['ev-a', 'ev-f', 'ev-b'],
			duplicates: 0,
		},
	},
	{
		name: 'no events → no runs, nothing counted',
		events: [],
		expected: { runs: [], kept: [], duplicates: 0 },
	},
]

describe('pairRuns', () => {
	for (const row of ROWS) {
		it(row.name, () => {
			expect(
				((result) => ({
					runs: result.runs.map((run) => ({
						run: run.run,
						start: run.start?.id,
						end: run.end?.id,
					})),
					kept: result.events.map((kept) => kept.id),
					duplicates: result.duplicates,
				}))(pairRuns({ events: row.events })),
			).toEqual(row.expected)
		})
	}
})
