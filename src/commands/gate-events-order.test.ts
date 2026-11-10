/**
 * The order of a step's events (33L0 decision D12): `step.start` is on disk before the step's work begins and
 * `step.end` is written after the step's own record. Pinned by observation: a probe step copies the events file
 * while it runs, and a spy on the event writer looks for the record when `step.end` is appended.
 */
import { existsSync } from 'node:fs'

import { gitPathOf } from '../../test/gate-records.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import { createStepLot, eventsProbeStep, seenFile } from '../../test/step-events-lot.ts'
import { readEvents } from '../lib/events/read-events.ts'
import { writeEvent } from '../lib/events/write-event.ts'
import { runContrib } from './contrib.ts'
import { runGate } from './gate.ts'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { LotEvent } from '../lib/events/event.types.ts'

/**
 * What the spy saw at each `step.end` append: the step, and whether its record was on disk then; and the record
 * each step family leaves (the record files' names, as the gate and contrib write them).
 */
const { endsSeen, RECORD_OF_STEP } = vi.hoisted(() => ({
	endsSeen: [] as { step: unknown; recordOnDisk: boolean }[],
	RECORD_OF_STEP: {
		'gate-fast': 'dialecte-gate-fast.json',
		'gate-full': 'dialecte-gate-full.json',
		contrib: 'dialecte-gate-contrib.json',
	} as Record<string, string>,
}))

vi.mock('../lib/events/write-event.ts', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../lib/events/write-event.ts')>()
	return {
		...actual,
		writeEvent: vi.fn((params: Parameters<typeof actual.writeEvent>[0]) => {
			const { event } = params
			const name = RECORD_OF_STEP[String(event.step)]
			if (event.kind === 'step.end' && name !== undefined)
				endsSeen.push({
					step: event.step,
					recordOnDisk: existsSync(gitPathOf({ root: String(event.worktree), name })),
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
	vi.unstubAllEnvs()
})

/** The kinds of the events a probe copied: what was on disk while the step ran. */
function kindsSeen(seen: string): string[] {
	return readEvents({ file: seen }).events.map((event: LotEvent) => event.kind)
}

describe(
	'step.start is on disk while the steps run',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('gate --fast → the probe sees the start and no end', async () => {
			const seen = seenFile()
			const lot = createStepLot({
				fast: (_, eventsFile) => [eventsProbeStep({ name: 'probe', seen, eventsFile })],
			})

			await runGate({ cwd: lot.worktree, argv: [] })

			expect(kindsSeen(seen)).toEqual(['step.start'])
		})

		it('gate --full → the probe sees the start and no end', async () => {
			const seen = seenFile()
			const lot = createStepLot({
				full: (_, eventsFile) => [eventsProbeStep({ name: 'probe', seen, eventsFile })],
			})

			await runGate({ cwd: lot.worktree, argv: ['--full'] })

			expect(kindsSeen(seen)).toEqual(['step.start'])
		})

		it('gate --hook → the probe sees the start and no end', async () => {
			const seen = seenFile()
			const lot = createStepLot({
				full: (_, eventsFile) => [
					eventsProbeStep({ name: 'probe', seen, eventsFile, counts: 'tests' }),
				],
			})

			await runGate({ cwd: lot.worktree, argv: ['--hook'] })

			expect(kindsSeen(seen)).toEqual(['step.start'])
		})

		it('contrib → the probe sees the start and no end', async () => {
			const seen = seenFile()
			const lot = createStepLot({
				contribSteps: (_, eventsFile) => [eventsProbeStep({ name: 'probe', seen, eventsFile })],
			})

			await runContrib({ cwd: lot.worktree, argv: [] })

			expect(kindsSeen(seen)).toEqual(['step.start'])
		})
	},
)

describe('step.end is written after the record', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('gate --fast → the record is on disk when the end is appended', async () => {
		const lot = createStepLot({ fast: [{ name: 'one', run: 'echo one' }] })

		await runGate({ cwd: lot.worktree, argv: [] })

		expect(endsSeen).toEqual([{ step: 'gate-fast', recordOnDisk: true }])
	})

	it('gate --full → the record is on disk when the end is appended', async () => {
		const lot = createStepLot({ full: [{ name: 'one', run: 'echo one' }] })

		await runGate({ cwd: lot.worktree, argv: ['--full'] })

		expect(endsSeen).toEqual([{ step: 'gate-full', recordOnDisk: true }])
	})

	it('contrib → the record is on disk when the end is appended', async () => {
		const lot = createStepLot({ contribSteps: [{ name: 'one', run: 'echo one' }] })

		await runContrib({ cwd: lot.worktree, argv: [] })

		expect(endsSeen).toEqual([{ step: 'contrib', recordOnDisk: true }])
	})
})
