/**
 * Step events of `dialecte handover run` (33L0 section 4 "Step events", "Which lot", "Heavy steps"; D12): a real run
 * is `handover-run`, not heavy, in the lot whose folder is the hand-over folder, its worktree the commit root (never
 * the worktree the lot's identity names); a rehearsal is `rehearsal`, heavy, the same commit root (never the clone),
 * with a whole-run marker that a hook part's own marker nests in; a hand-over folder outside every store records
 * nothing. Every call runs from the worktree of another lot (the bystander): that lot's file stays without events.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

import { createFakeClock } from '../../test/fake-clock.ts'
import { gitPathOf } from '../../test/gate-records.ts'
import { removeHookLogs } from '../../test/hook-logs.ts'
import { noRepositoryCli } from '../../test/repository-cli-probe.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import { countingStep, createCounter, seedFullGate } from '../../test/scratch-checks.ts'
import { temporaryFolder } from '../../test/scratch-repository.ts'
import { HANDOVER_CLI_SOURCE, HOOK_RECORD_FILE } from '../../test/step-events-handover.constants.ts'
import {
	createHandoverLot,
	heavyTestProbeStep,
	markerCopyingHook,
} from '../../test/step-events-handover.ts'
import {
	eventsOfStep,
	markerFilesIn,
	markersSeen,
	seenFile,
	stepEventsOf,
} from '../../test/step-events-lot.ts'
import { spyOnWarnings } from '../../test/step-events-tdd.ts'
import { createRecordingSpawner } from '../../test/worktree-pool.ts'
import { writeEvent } from '../lib/events/write-event.ts'
import { INVALID_STEP, INVALID_STEP_PROBLEMS } from '../lib/gate/gate-config.constants.ts'
import { runHandoverRun } from './handover.ts'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { HandoverLot } from '../../test/step-events-handover.types.ts'

/** The line a rehearsal says when no clone is made. */
const SKIPPED_LINE = "rehearsal skipped: every lot's tree has a green record"

/** What the spy saw at each `step.end` append: the step, and whether the hook record was on disk then. */
const { endsSeen } = vi.hoisted(() => ({
	endsSeen: [] as { step: unknown; hookRecordOnDisk: boolean }[],
}))

vi.mock('node:fs', async (importOriginal) => {
	const { withCapturedStandardError } = await import('../../test/standard-error-capture.ts')
	const actual = await importOriginal<typeof import('node:fs')>()
	return withCapturedStandardError(actual)
})

vi.mock('../lib/events/write-event.ts', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../lib/events/write-event.ts')>()
	return {
		...actual,
		writeEvent: vi.fn((params: Parameters<typeof actual.writeEvent>[0]) => {
			const { event } = params
			if (event.kind === 'step.end')
				endsSeen.push({
					step: event.step,
					hookRecordOnDisk: existsSync(
						gitPathOf({ root: String(event.worktree), name: HOOK_RECORD_FILE }),
					),
				})
			return actual.writeEvent(params)
		}),
	}
})

beforeEach(function clearSpy() {
	endsSeen.length = 0
	vi.mocked(writeEvent).mockClear()
})

afterEach(function restoreEnvironment() {
	vi.restoreAllMocks()
	vi.unstubAllEnvs()
})

/**
 * `handover run` on the lot's hand-over folder, run from the worktree of the bystander lot (never from the process's
 * own folder), as an in-process call whose lines are kept (no background removal is started).
 */
async function runHandover(params: { lot: HandoverLot; argv?: string[] }) {
	const lines: string[] = []
	removeHookLogs({ lines })
	const exitCode = await runHandoverRun({
		probe: noRepositoryCli,
		argv: [params.lot.folder, ...(params.argv ?? [])],
		write: (line) => lines.push(line),
		clock: createFakeClock(),
		colour: false,
		scratchRoot: temporaryFolder('dialecte-scratch-root-'),
		spawner: createRecordingSpawner().spawner,
		cwd: params.lot.bystander.worktree,
	})
	return { exitCode, text: lines.join('\n') }
}

/** The step events the bystander lot holds: none, whatever ran from its worktree. */
function bystanderEvents(lot: HandoverLot) {
	return stepEventsOf({ eventsFile: lot.bystander.eventsFile })
}

describe('handover run (real) in a lot', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a run that commits → one step.start and one step.end of handover-run in the lot of the hand-over folder, not heavy, by the cli, paired by run, none in the lot of the folder it ran from', async () => {
		const lot = createHandoverLot()

		const result = await runHandover({ lot })
		const events = eventsOfStep({ lot, step: 'handover-run' })

		expect({
			exitCode: result.exitCode,
			kinds: events.map((event) => event.kind),
			lots: events.map((event) => event.lot),
			by: events.map((event) => event.by),
			heavy: events.map((event) => event.heavy),
			paired: events[0]?.run === events[1]?.run && events[0]?.run !== undefined,
			allSteps: stepEventsOf(lot).map((event) => event.step),
			bystander: bystanderEvents(lot),
		}).toEqual({
			exitCode: 0,
			kinds: ['step.start', 'step.end'],
			lots: [lot.lotName, lot.lotName],
			by: ['cli', 'cli'],
			heavy: [false, false],
			paired: true,
			allSteps: ['handover-run', 'handover-run'],
			bystander: [],
		})
	})

	it('the events → the worktree is the real path of the commit root (not the worktree the identity names), not a throwaway, the same on both; the end has exit 0, a duration, no state hash and no parts', async () => {
		const lot = createHandoverLot()

		await runHandover({ lot })
		const [start, end] = eventsOfStep({ lot, step: 'handover-run' })

		expect({
			identityApart: lot.identityWorktree !== lot.root,
			sameWorktree: start?.worktree === end?.worktree,
			startPlace: [start?.worktree, start?.throwaway],
			endPlace: [end?.worktree, end?.throwaway],
			exit: end?.exit,
			duration: typeof end?.durationMs,
			stateHash: end?.stateHash,
			parts: end?.parts ?? [],
		}).toEqual({
			identityApart: true,
			sameWorktree: true,
			startPlace: [lot.root, false],
			endPlace: [lot.root, false],
			exit: 0,
			duration: 'number',
			stateHash: null,
			parts: [],
		})
	})

	it('no heavy marker stands while the hook runs (a hand-over run is not heavy), and none is left', async () => {
		const seen = seenFile()
		const lot = createHandoverLot({
			hookScript: (markerFolder) => markerCopyingHook({ markerFolder, seen }),
		})

		await runHandover({ lot })

		expect({
			during: markersSeen(seen),
			left: markerFilesIn(lot.markerFolder),
		}).toEqual({ during: [], left: [] })
	})

	it('the end is appended after the hook record is on disk', async () => {
		const lot = createHandoverLot()

		await runHandover({ lot })

		expect(endsSeen).toEqual([{ step: 'handover-run', hookRecordOnDisk: true }])
	})
})

describe('handover run refused before it runs', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a gate config that is broken after the hand-over was written → exit 2 with the config message, not one event in the lot', async () => {
		const lot = createHandoverLot()
		const broken = [{ name: 'both', run: 'true', scoped: true, changedOnly: true }]
		writeFileSync(
			join(lot.root, 'package.json'),
			`${JSON.stringify({ name: 'demo', scripts: {}, dialecte: { gate: { fast: broken, full: broken } } })}\n`,
		)
		vi.mocked(writeEvent).mockClear()

		const result = await runHandover({ lot })

		expect({
			exitCode: result.exitCode,
			message: result.text.includes(
				INVALID_STEP.replace('{list}', 'dialecte.gate.fast')
					.replace('{step}', '"both"')
					.replace('{problem}', INVALID_STEP_PROBLEMS.scopedWithChangedOnly),
			),
			writes: vi.mocked(writeEvent).mock.calls.length,
			events: stepEventsOf(lot),
		}).toEqual({ exitCode: 2, message: true, writes: 0, events: [] })
	})
})

describe('handover run outside a lot', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a hand-over folder outside every store → the same result, no event in any lot, no warning', async () => {
		const lot = createHandoverLot({ outside: true })
		const warnings = spyOnWarnings()
		vi.mocked(writeEvent).mockClear()

		const result = await runHandover({ lot })

		expect({
			exitCode: result.exitCode,
			eventWrites: vi
				.mocked(writeEvent)
				.mock.calls.filter(([written]) => basename(written.file) !== 'cards.log').length,
			eventsFile: existsSync(lot.eventsFile),
			bystander: bystanderEvents(lot),
			warnings: warnings.lines,
		}).toEqual({ exitCode: 0, eventWrites: 0, eventsFile: false, bystander: [], warnings: [] })
	})
})

describe(
	'handover run: events that cannot be written',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('a folder stands at events.jsonl, in place of a read-only file → the same exit and output, the lot still committed, one warning line', async () => {
			const reference = createHandoverLot()
			const blocked = createHandoverLot()
			mkdirSync(blocked.eventsFile)
			const warnings = spyOnWarnings()

			const expected = await runHandover({ lot: reference })
			const result = await runHandover({ lot: blocked })

			expect({
				sameExit: result.exitCode === expected.exitCode,
				exitCode: result.exitCode,
				warnings: warnings.lines.length,
			}).toEqual({ sameExit: true, exitCode: 0, warnings: 1 })
		})
	},
)

describe('handover run --rehearse in a lot', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a rehearsal in a clone → one pair of rehearsal in the lot, heavy, the commit root (not the clone) as worktree, the whole-run marker present while the hook runs and gone after', async () => {
		const seen = seenFile()
		const lot = createHandoverLot({
			hookScript: (markerFolder) => markerCopyingHook({ markerFolder, seen }),
		})

		const result = await runHandover({ lot, argv: ['--rehearse'] })
		const events = eventsOfStep({ lot, step: 'rehearsal' })

		expect({
			exitCode: result.exitCode,
			kinds: events.map((event) => event.kind),
			lots: events.map((event) => event.lot),
			heavy: events.map((event) => event.heavy),
			worktrees: events.map((event) => event.worktree),
			throwaway: events.map((event) => event.throwaway),
			exit: events[1]?.exit,
			stateHash: events[1]?.stateHash,
			paired: events[0]?.run === events[1]?.run && events[0]?.run !== undefined,
			handoverRuns: eventsOfStep({ lot, step: 'handover-run' }).length,
			during: markersSeen(seen).map((marker) => [marker.step, marker.lot, marker.pid]),
			left: markerFilesIn(lot.markerFolder),
			bystander: bystanderEvents(lot),
		}).toEqual({
			exitCode: 0,
			kinds: ['step.start', 'step.end'],
			lots: [lot.lotName, lot.lotName],
			heavy: [true, true],
			worktrees: [lot.root, lot.root],
			throwaway: [false, false],
			exit: 0,
			stateHash: null,
			paired: true,
			handoverRuns: 0,
			during: [['rehearsal', lot.lotName, process.pid]],
			left: [],
			bystander: [],
		})
	})

	it('the hook runs gate --hook with a declared heavy step → while it runs, two markers stand: the rehearsal and its own gate-hook part, each naming its step', async () => {
		const seen = seenFile()
		const lot = createHandoverLot({
			gate: (markerFolder) => ({
				full: [heavyTestProbeStep({ markerFolder, seen })],
			}),
			hookScript: `node '${HANDOVER_CLI_SOURCE}' gate --hook`,
		})

		const result = await runHandover({ lot, argv: ['--rehearse'] })

		expect({
			exitCode: result.exitCode,
			during: markersSeen(seen)
				.map((marker) => marker.step)
				.sort(),
			rehearsalIsThisProcess: markersSeen(seen).find((marker) => marker.step === 'rehearsal')?.pid,
			left: markerFilesIn(lot.markerFolder),
		}).toEqual({
			exitCode: 0,
			during: ['gate-hook: probe', 'rehearsal'],
			rehearsalIsThisProcess: process.pid,
			left: [],
		})
	})

	it('a rehearsal every lot of which a green record answers for (no clone) → still one pair of rehearsal, reuse whole, the commit root as worktree, no marker left, exit 0', async () => {
		const step = countingStep({ counter: createCounter() })
		const lot = createHandoverLot({ gate: { fast: [step], full: [step] } })
		await seedFullGate(lot.root)

		const result = await runHandover({ lot, argv: ['--rehearse'] })
		const events = eventsOfStep({ lot, step: 'rehearsal' })

		expect({
			exitCode: result.exitCode,
			noClone: result.text.includes(SKIPPED_LINE),
			kinds: events.map((event) => event.kind),
			heavy: events[0]?.heavy,
			worktrees: events.map((event) => event.worktree),
			throwaway: events.map((event) => event.throwaway),
			reuse: events[1]?.reuse,
			exit: events[1]?.exit,
			left: markerFilesIn(lot.markerFolder),
			bystander: bystanderEvents(lot),
		}).toEqual({
			exitCode: 0,
			noClone: true,
			kinds: ['step.start', 'step.end'],
			heavy: true,
			worktrees: [lot.root, lot.root],
			throwaway: [false, false],
			reuse: 'whole',
			exit: 0,
			left: [],
			bystander: [],
		})
	})

	it('a rehearsal in a hand-over folder outside every store → no event, the whole-run marker still written (lot null) while it runs', async () => {
		const seen = seenFile()
		const lot = createHandoverLot({
			outside: true,
			hookScript: (markerFolder) => markerCopyingHook({ markerFolder, seen }),
		})

		const result = await runHandover({ lot, argv: ['--rehearse'] })

		expect({
			exitCode: result.exitCode,
			eventsFile: existsSync(lot.eventsFile),
			bystander: bystanderEvents(lot),
			during: markersSeen(seen).map((marker) => [marker.step, marker.lot]),
			left: markerFilesIn(lot.markerFolder),
		}).toEqual({
			exitCode: 0,
			eventsFile: false,
			bystander: [],
			during: [['rehearsal', null]],
			left: [],
		})
	})
})
