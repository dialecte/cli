/**
 * Step events of `dialecte contrib` (33L0 section 4 "Step events", "Heavy steps"): the step `contrib`, heavy, a marker
 * for the whole run, one part per row, the reuse of the rows a green `gate --full` already ran.
 */
import { mkdirSync } from 'node:fs'

import { readRecordFile } from '../../test/gate-records.ts'
import { addWorktreeFolder, linkLot } from '../../test/lot-stores.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import { CONTRIB_RECORD_FILE } from '../../test/scratch-contrib.constants.ts'
import { STEP_LOT } from '../../test/step-events-lot.constants.ts'
import {
	createStepLot,
	eventsOfStep,
	markerFilesIn,
	markerProbeStep,
	markersSeen,
	seenFile,
	stepEventsOf,
} from '../../test/step-events-lot.ts'
import { runContrib } from './contrib.ts'
import { runGate } from './gate.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LotEvent } from '../lib/events/event.types.ts'
import type { GateRecord } from '../lib/gate-records/gate-records.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const ONE = { name: 'one', run: 'echo one' }

/** The parts of an end event that are named `names`, as [name, status, reused]. */
function partsNamed(params: { end: LotEvent | undefined; names: string[] }) {
	return ((params.end?.parts ?? []) as { name: string; status: string; reused?: boolean }[])
		.filter((part) => params.names.includes(part.name))
		.map((part) => [part.name, part.status, part.reused ?? false])
}

describe('contrib in the lot worktree', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a fresh run → contrib start and end, heavy, a marker for the whole run, reuse none, the record state hash', async () => {
		const seen = seenFile()
		const lot = createStepLot({
			contribSteps: (markerFolder) => [ONE, markerProbeStep({ name: 'probe', seen, markerFolder })],
		})

		const result = await runContrib({ cwd: lot.worktree, argv: [] })
		const record = readRecordFile<GateRecord>({ root: lot.worktree, name: CONTRIB_RECORD_FILE })
		const events = eventsOfStep({ lot, step: 'contrib' })

		expect({
			exitCode: result.exitCode,
			kinds: events.map((event) => event.kind),
			lots: events.map((event) => event.lot),
			heavy: events.map((event) => event.heavy),
			exit: events[1]?.exit,
			reuse: events[1]?.reuse,
			stateHash: events[1]?.stateHash,
			seen: markersSeen(seen).map((marker) => [marker.step, marker.lot]),
			left: markerFilesIn(lot.markerFolder),
			parts: partsNamed({ end: events[1], names: ['one', 'probe'] }),
		}).toEqual({
			exitCode: 0,
			kinds: ['step.start', 'step.end'],
			lots: [STEP_LOT, STEP_LOT],
			heavy: [true, true],
			exit: 0,
			reuse: 'none',
			stateHash: record?.stateHash,
			seen: [['contrib', STEP_LOT]],
			left: [],
			parts: [
				['one', 'passed', false],
				['probe', 'passed', false],
			],
		})
	})

	it('a step a green gate --full already ran with the same name and command, another not → reuse partly, that part reused', async () => {
		const lot = createStepLot({
			full: [ONE],
			contribSteps: [ONE, { name: 'two', run: 'echo two' }],
		})

		await runGate({ cwd: lot.worktree, argv: ['--full'] })
		const result = await runContrib({ cwd: lot.worktree, argv: [] })
		const end = eventsOfStep({ lot, step: 'contrib' })[1]

		expect({
			exitCode: result.exitCode,
			reuse: end?.reuse,
			parts: partsNamed({ end, names: ['one', 'two'] }),
		}).toEqual({
			exitCode: 0,
			reuse: 'partly',
			parts: [
				['one', 'passed', true],
				['two', 'passed', false],
			],
		})
	})

	it('a second run answered from its own record → reuse whole, every part reused', async () => {
		const lot = createStepLot({ contribSteps: [ONE, { name: 'two', run: 'echo two' }] })

		await runContrib({ cwd: lot.worktree, argv: [] })
		await runContrib({ cwd: lot.worktree, argv: [] })
		const ends = eventsOfStep({ lot, step: 'contrib' }).filter((event) => event.kind === 'step.end')

		expect({
			reuse: ends.map((end) => end.reuse),
			parts: partsNamed({ end: ends[1], names: ['one', 'two'] }),
		}).toEqual({
			reuse: ['none', 'whole'],
			parts: [
				['one', 'passed', true],
				['two', 'passed', true],
			],
		})
	})

	it('a failing step → exit 1 in the end, the record state hash', async () => {
		const lot = createStepLot({ contribSteps: [{ name: 'bad', run: 'exit 2' }] })

		const result = await runContrib({ cwd: lot.worktree, argv: [] })
		const record = readRecordFile<GateRecord>({ root: lot.worktree, name: CONTRIB_RECORD_FILE })
		const end = eventsOfStep({ lot, step: 'contrib' })[1]

		expect({ exitCode: result.exitCode, exit: end?.exit, stateHash: end?.stateHash }).toEqual({
			exitCode: 1,
			exit: 1,
			stateHash: record?.stateHash,
		})
	})

	it("in a worktree whose .dialecte/lot was copied from the lot's → one step.foreign contrib in that lot, one warning naming the lot, no start or end", async () => {
		const lot = createStepLot({ contribSteps: [ONE] })
		const copied = addWorktreeFolder({ workspace: lot.workspace, folderName: 'copied-checkout' })
		linkLot({ worktree: copied, lotFolder: lot.lotFolder })
		const lines: string[] = []

		const result = await runContrib({
			cwd: copied,
			argv: [],
			warn: (line) => void lines.push(line),
		})

		expect({
			exitCode: result.exitCode,
			events: stepEventsOf(lot).map((event) => [event.kind, event.step, event.worktree]),
			warnings: lines.map((line) => [
				line.includes(STEP_LOT),
				line.startsWith('events: not recorded'),
			]),
		}).toEqual({
			exitCode: 0,
			events: [['step.foreign', 'contrib', copied]],
			warnings: [[true, false]],
		})
	})

	it('a folder stands at events.jsonl, in place of a read-only file → the same exit as without it, one warning line', async () => {
		const reference = createStepLot({ contribSteps: [ONE] })
		const blocked = createStepLot({ contribSteps: [ONE] })
		mkdirSync(blocked.eventsFile)
		const lines: string[] = []

		const expected = await runContrib({ cwd: reference.worktree, argv: [] })
		const result = await runContrib({
			cwd: blocked.worktree,
			argv: [],
			warn: (line) => void lines.push(line),
		})

		expect({
			exitCode: result.exitCode === expected.exitCode,
			warnings: lines.map((line) => line.startsWith('events: not recorded: ')),
		}).toEqual({ exitCode: true, warnings: [true] })
	})
})
