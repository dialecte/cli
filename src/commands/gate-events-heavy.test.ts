/**
 * Heavy steps of a gate run (33L0 section 4 "Heavy steps", case 17): the run's and the part's `heavy`, and the
 * marker `<kind>: <part>` of a heavy part, written while that part runs only. Writes of markers are counted
 * through a spy wrapped around the real writer (a reused or undeclared part must not write one, so makes no `ps`
 * call).
 */
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import { TEST_SUMMARY_COMMAND } from '../../test/step-events-lot.constants.ts'
import {
	createStepLot,
	eventsOfStep,
	markerFilesIn,
	markerProbeStep,
	markersSeen,
	partsOf,
	seenFile,
} from '../../test/step-events-lot.ts'
import { writeHeavyMarker } from '../lib/events/heavy-markers.ts'
import { processStartTime } from '../lib/process-start-time.ts'
import { runGate } from './gate.ts'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/events/heavy-markers.ts', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../lib/events/heavy-markers.ts')>()
	return { ...actual, writeHeavyMarker: vi.fn(actual.writeHeavyMarker) }
})

// the start time is read through `ps`: a part that writes no marker must not ask for it (no `ps` call)
vi.mock('../lib/process-start-time.ts', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../lib/process-start-time.ts')>()
	return { ...actual, processStartTime: vi.fn(actual.processStartTime) }
})

beforeEach(function clearSpy() {
	vi.mocked(writeHeavyMarker).mockClear()
	vi.mocked(processStartTime).mockClear()
})

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The `step` of every marker the process wrote so far. */
function markersWritten(): string[] {
	return vi.mocked(writeHeavyMarker).mock.calls.map(([params]) => params.step)
}

/** Three steps: one before the heavy part, the part (heavy when `heavy`), one after; each records the markers it sees. */
function threeSteps(params: { heavy: boolean; seen: [string, string, string] }) {
	return (markerFolder: string) => [
		markerProbeStep({ name: 'before', seen: params.seen[0], markerFolder }),
		markerProbeStep({ name: 'browser', seen: params.seen[1], markerFolder, heavy: params.heavy }),
		markerProbeStep({ name: 'after', seen: params.seen[2], markerFolder }),
	]
}

describe('gate --fast with a heavy part', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a declared heavy part that runs → its part and the run heavy, the marker gate-fast: browser present during that part only', async () => {
		const seen: [string, string, string] = [seenFile(), seenFile(), seenFile()]
		const lot = createStepLot({ fast: threeSteps({ heavy: true, seen }) })

		const result = await runGate({ cwd: lot.worktree, argv: [] })
		const end = eventsOfStep({ lot, step: 'gate-fast' })[1]

		expect({
			exitCode: result.exitCode,
			runHeavy: end?.heavy,
			partHeavy: ((end?.parts ?? []) as { name: string; heavy?: boolean }[])
				.filter((part) => ['before', 'browser', 'after'].includes(part.name))
				.map((part) => [part.name, part.heavy ?? false]),
			before: markersSeen(seen[0]).map((marker) => marker.step),
			during: markersSeen(seen[1]).map((marker) => marker.step),
			after: markersSeen(seen[2]).map((marker) => marker.step),
			written: markersWritten(),
			left: markerFilesIn(lot.markerFolder),
		}).toEqual({
			exitCode: 0,
			runHeavy: true,
			partHeavy: [
				['before', false],
				['browser', true],
				['after', false],
			],
			before: [],
			during: ['gate-fast: browser'],
			after: [],
			written: ['gate-fast: browser'],
			left: [],
		})
	})

	it('the same heavy part reused from the record → the part heavy true, the run heavy false, no marker written', async () => {
		const seen: [string, string, string] = [seenFile(), seenFile(), seenFile()]
		const lot = createStepLot({ fast: threeSteps({ heavy: true, seen }) })

		await runGate({ cwd: lot.worktree, argv: [] })
		vi.mocked(writeHeavyMarker).mockClear()
		vi.mocked(processStartTime).mockClear()
		await runGate({ cwd: lot.worktree, argv: [] })
		const end = eventsOfStep({ lot, step: 'gate-fast' })[3]

		expect({
			reuse: end?.reuse,
			runHeavy: end?.heavy,
			browser: ((end?.parts ?? []) as { name: string; heavy?: boolean; reused?: boolean }[])
				.filter((part) => part.name === 'browser')
				.map((part) => [part.heavy, part.reused]),
			written: markersWritten(),
			startTimeReads: vi.mocked(processStartTime).mock.calls.length,
		}).toEqual({
			reuse: 'whole',
			runHeavy: false,
			browser: [[true, true]],
			written: [],
			startTimeReads: 0,
		})
	})

	it('a part not declared heavy → neither the part nor the run heavy, no marker written', async () => {
		const seen: [string, string, string] = [seenFile(), seenFile(), seenFile()]
		const lot = createStepLot({ fast: threeSteps({ heavy: false, seen }) })

		await runGate({ cwd: lot.worktree, argv: [] })
		const end = eventsOfStep({ lot, step: 'gate-fast' })[1]

		expect({
			runHeavy: end?.heavy,
			partHeavy: ((end?.parts ?? []) as { name: string; heavy?: boolean }[])
				.filter((part) => part.name === 'browser')
				.map((part) => part.heavy ?? false),
			written: markersWritten(),
			during: markersSeen(seen[1]),
		}).toEqual({ runHeavy: false, partHeavy: [false], written: [], during: [] })
	})
})

describe('gate --hook answered from a record', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a green --full then --hook → one gate-hook start and end, reuse whole, the part reused and heavy from the record, the run not heavy, no state hash, no marker', async () => {
		const lot = createStepLot({
			full: [{ name: 'tests', run: TEST_SUMMARY_COMMAND, counts: 'tests', heavy: true }],
		})

		await runGate({ cwd: lot.worktree, argv: ['--full'] })
		vi.mocked(writeHeavyMarker).mockClear()
		vi.mocked(processStartTime).mockClear()
		const result = await runGate({ cwd: lot.worktree, argv: ['--hook'] })
		const events = eventsOfStep({ lot, step: 'gate-hook' })

		expect({
			exitCode: result.exitCode,
			kinds: events.map((event) => event.kind),
			reuse: events[1]?.reuse,
			heavy: events[1]?.heavy,
			stateHash: events[1]?.stateHash,
			parts: partsOf(events[1]).map((part) => [part.name, part.reused, part.heavy]),
			written: markersWritten(),
			startTimeReads: vi.mocked(processStartTime).mock.calls.length,
		}).toEqual({
			exitCode: 0,
			kinds: ['step.start', 'step.end'],
			reuse: 'whole',
			heavy: false,
			stateHash: null,
			parts: [['tests', true, true]],
			written: [],
			startTimeReads: 0,
		})
	})
})

describe('gate --hook with a heavy part', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a declared heavy test step → the marker gate-hook: browser while it runs, the part and the run heavy', async () => {
		const seen = seenFile()
		const lot = createStepLot({
			full: (markerFolder) => [
				{
					...markerProbeStep({ name: 'browser', seen, markerFolder, heavy: true }),
					run: `cat ${JSON.stringify(markerFolder)}/*.json > ${JSON.stringify(seen)} 2>/dev/null; ${TEST_SUMMARY_COMMAND}`,
					counts: 'tests',
				},
			],
		})

		const result = await runGate({ cwd: lot.worktree, argv: ['--hook'] })
		const end = eventsOfStep({ lot, step: 'gate-hook' })[1]

		expect({
			exitCode: result.exitCode,
			runHeavy: end?.heavy,
			seen: markersSeen(seen).map((marker) => marker.step),
			written: markersWritten(),
			left: markerFilesIn(lot.markerFolder),
		}).toEqual({
			exitCode: 0,
			runHeavy: true,
			seen: ['gate-hook: browser'],
			written: ['gate-hook: browser'],
			left: [],
		})
	})
})
