/**
 * What every reader shows of a damaged lot (P2.1, P2.3, P2.6): `lot status` prints `damaged` with the reason and the
 * stop command, never `no lot`; `lot wait` and `lot result` answer at once with the same state and exit 6; `lot
 * answer` refuses (exit 2) naming the damage; `inbox` keeps its damaged line and gains the stop command. A folder
 * that is no lot (a `.tmp-` folder, a name of no lot shape) is never damaged. The reasons are the fixed words of the
 * store; the line shapes around them are written out here.
 */
import { rmSync } from 'node:fs'
import { join } from 'node:path'

import {
	DAMAGED_NAME,
	DAMAGES,
	NO_ONE_WAITS,
	ONE_STEP_SCENARIO,
	ONE_STEP_SCENARIO_NAME,
} from '../../test/damaged-lot-workspace.constants.ts'
import {
	briefDamagedLotIn,
	damagedJson,
	damagedLines,
	damagedLotIn,
} from '../../test/damaged-lot-workspace.ts'
import { inboxIn } from '../../test/inbox-workspace.ts'
import { runCliSplit, withStdoutJson } from '../../test/lot-handover-workspace.ts'
import { createStartWorkspace, snapshotOf, withJson } from '../../test/lot-start-workspace.ts'
import { LOT_NAME, START_NOW } from '../../test/lot-start.constants.ts'
import { resultOf } from '../../test/lot-stop-workspace.ts'
import { otherLivePid } from '../../test/other-live-pid.ts'
import { createWaitTime, startSimulated, waitRaw } from '../../test/simulated-lot.ts'
import { writeRecordFile } from '../../test/store-records.ts'
import { STORE_CASE_TIMEOUT, WAIT_KILL_BOUND_MS } from '../../test/test-timing.constants.ts'
import { RECORD_DAMAGE_REASONS } from '../lib/store/store.constants.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { DamagedLot } from '../../test/damaged-lot-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** `lot wait <id>` from the lot's repository on a clock that moves with its sleeps; the result and the sleeps made. */
async function waitOf(params: { lot: Pick<DamagedLot, 'start' | 'name'>; json: boolean }): Promise<{
	exitCode: number
	output: string
	sleeps: number[]
}> {
	const time = createWaitTime()
	const result = await waitRaw({
		cwd: params.lot.start.repository,
		// a bound on the fake clock: a lot that wrongly reads working ends in a timeout, never in a loop with no end
		argv: [params.lot.name, '--timeout', '5', ...(params.json ? ['--json'] : [])],
		time,
	})
	return { exitCode: result.exitCode, output: result.output, sleeps: time.sleeps }
}

describe('lot status of a damaged lot', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of DAMAGES)
		it(`${row.title} -> prints damaged with the reason, the next line names lot stop; the JSON holds state damaged and the reason; never no lot`, () => {
			const start = createStartWorkspace()
			const lot = damagedLotIn({ start, kind: row.kind })

			const text = runLot({ cwd: start.repository, argv: ['status', lot.name] })
			const json = runLot({ cwd: start.repository, argv: ['status', lot.name, '--json'] })

			expect(text.output.split('\n')).toEqual(damagedLines(lot))
			expect(JSON.parse(json.output)).toEqual(damagedJson(lot))
			expect([text.exitCode, json.exitCode]).toEqual([6, 6])
		})

	it('identity missing, asked by its index -> the same damaged lines, exit 6', () => {
		const start = createStartWorkspace()
		const lot = damagedLotIn({ start, kind: 'identityMissing' })

		const status = runLot({ cwd: start.repository, argv: ['status', '0007'] })

		expect([status.exitCode, status.output.split('\n')]).toEqual([6, damagedLines(lot)])
	})
})

describe('lot wait of a damaged lot', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of DAMAGES)
		it(`${row.title} -> answers at once with exit 6 and the damaged state, text and JSON, no sleep`, async () => {
			const start = createStartWorkspace()
			const lot = damagedLotIn({ start, kind: row.kind })

			const text = await waitOf({ lot, json: false })
			const json = await waitOf({ lot, json: true })

			expect({
				text: [text.exitCode, text.output.split('\n'), text.sleeps],
				json: [json.exitCode, JSON.parse(json.output), json.sleeps],
			}).toEqual({
				text: [6, damagedLines(lot), []],
				json: [6, expect.objectContaining(damagedJson(lot)), []],
			})
		})
})

describe('lot result of a damaged lot', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of DAMAGES)
		it(`${row.title} -> answers at once with exit 6 and the damaged state, text and JSON`, () => {
			const start = createStartWorkspace()
			const lot = damagedLotIn({ start, kind: row.kind })

			const text = resultOf({ cwd: start.repository, id: lot.name, json: false })
			const json = resultOf({ cwd: start.repository, id: lot.name })

			expect({
				text: [text.exitCode, text.output.split('\n')],
				json: [json.exitCode, JSON.parse(json.output)],
			}).toEqual({
				text: [6, damagedLines(lot)],
				json: [6, expect.objectContaining(damagedJson(lot))],
			})
		})
})

describe('lot answer on a damaged lot', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of DAMAGES)
		it(`${row.title} -> exit 2 naming the lot and its damage, nothing written`, () => {
			const start = createStartWorkspace()
			const lot = damagedLotIn({ start, kind: row.kind })
			const before = snapshotOf(lot.lotFolder)

			const text = runLot({
				cwd: start.repository,
				argv: ['answer', lot.name, 'q1', 'keep'],
				now: START_NOW,
			})
			const json = runLot({
				cwd: start.repository,
				argv: ['answer', lot.name, 'q1', 'keep', '--json'],
				now: START_NOW,
			})

			expect([text.exitCode, json.exitCode]).toEqual([2, 2])
			expect(text.output).toContain(lot.name)
			expect(text.output).toContain(row.reason)
			expect(text.output).not.toContain(`no lot ${lot.name}`)
			expect((JSON.parse(json.output) as { error: string }).error).toContain(row.reason)
			expect(snapshotOf(lot.lotFolder)).toEqual(before)
		})
})

describe('inbox with a damaged lot', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of DAMAGES)
		it(`${row.title} -> one damaged line naming the folder and the reason and the stop command, in JSON the folder and the reason, exit 0`, () => {
			const start = createStartWorkspace()
			const lot = damagedLotIn({ start, kind: row.kind })

			const text = inboxIn({ cwd: start.repository })
			const json = inboxIn({ cwd: start.repository, words: ['--json'] })

			const lines = text.output.split('\n').filter((line) => line.startsWith('damaged '))
			expect({ exitCodes: [text.exitCode, json.exitCode], lines: lines.length }).toEqual({
				exitCodes: [0, 0],
				lines: 1,
			})
			expect(lines[0].startsWith(`damaged ${lot.lotFolder}: ${row.reason}`)).toBe(true)
			expect(lines[0]).toContain(`dialecte lot stop ${lot.name} --reason <text>`)
			expect(JSON.parse(json.output)).toMatchObject({
				waiting: [],
				damaged: [{ folder: lot.lotFolder, reason: row.reason }],
			})
		})

	it('a lot with no identity and no brief -> the inbox lists it damaged with the identity reason', () => {
		const start = createStartWorkspace()
		const lot = briefDamagedLotIn({ start, brief: 'missing' })

		expect(JSON.parse(inboxIn({ cwd: start.repository, words: ['--json'] }).output)).toMatchObject({
			damaged: [{ folder: lot.lotFolder, reason: RECORD_DAMAGE_REASONS.identityUnreadable }],
		})
	})

	it('a .tmp- folder of a live builder beside a damaged lot -> never damaged, never listed: the one damaged line is the lot’s, with the stop command', () => {
		const start = createStartWorkspace()
		const lot = damagedLotIn({ start, kind: 'identityMissing' })
		writeRecordFile({
			folder: join(start.store, `.0005-repo-half.tmp-${otherLivePid()}`),
			name: 'brief.json',
			text: '{}',
		})

		const lines = inboxIn({ cwd: start.repository })
			.output.split('\n')
			.filter((line) => line.startsWith('damaged '))

		expect(lines).toEqual([
			expect.stringContaining(`dialecte lot stop ${lot.name} --reason <text>`),
		])
	})

	it('a folder whose name has no lot name shape -> not damaged, not listed', () => {
		const start = createStartWorkspace()
		writeRecordFile({ folder: join(start.store, 'scratch'), name: 'notes.txt', text: 'x' })
		writeRecordFile({ folder: join(start.store, '0042'), name: 'notes.txt', text: 'x' })

		expect(inboxIn({ cwd: start.repository })).toEqual({ exitCode: 1, output: NO_ONE_WAITS })
	})
})

describe(
	'a simulated lot with no scenario.json is no damaged lot and never waits (P2.6)',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		/** A simulated lot started from the default brief, its `scenario.json` then lost to a hand: nothing left to play. */
		function scenarioLostLot(): Pick<DamagedLot, 'start' | 'name' | 'lotFolder'> {
			const simulated = startSimulated({ scenario: 'question' })
			rmSync(join(simulated.lotFolder, 'scenario.json'))
			return { start: simulated.start, name: LOT_NAME, lotFolder: simulated.lotFolder }
		}

		it('lot wait --timeout 5 -> answers at once like lot result: exit 5, state working, no sleep', async () => {
			const lot = scenarioLostLot()

			const waited = await waitOf({ lot, json: true })

			expect([
				waited.exitCode,
				(JSON.parse(waited.output) as { state: string }).state,
				waited.sleeps,
			]).toEqual([5, 'working', []])
		})

		it('a lot whose steps are all played and that still reads working, lot wait --timeout 5 -> answers at once: exit 5, no sleep', async () => {
			const simulated = startSimulated({
				scenario: ONE_STEP_SCENARIO_NAME,
				seams: { scenarios: ONE_STEP_SCENARIO },
			})
			const lot = { start: simulated.start, name: LOT_NAME }
			// the first wait plays the one step; nothing is left to play after it
			await waitOf({ lot, json: true })

			const waited = await waitOf({ lot, json: true })

			expect([
				waited.exitCode,
				(JSON.parse(waited.output) as { state: string }).state,
				waited.sleeps,
			]).toEqual([5, 'working', []])
		})

		it('lot wait with no --timeout, run as a process with a kill bound -> ends at once with exit 5, never hangs', () => {
			const lot = scenarioLostLot()

			const run = runCliSplit({
				argv: ['lot', 'wait', lot.name, '--json'],
				cwd: lot.start.repository,
				timeoutMs: WAIT_KILL_BOUND_MS,
			})

			expect(withStdoutJson(run)).toMatchObject({ exitCode: 5, json: { state: 'working' } })
		})

		it('the lot read by status and the inbox after a wait that answered at once -> its own state, working, exit 0, listed in no damaged line', async () => {
			const lot = scenarioLostLot()

			const waited = await waitOf({ lot, json: true })

			expect([waited.exitCode, waited.sleeps]).toEqual([5, []])
			expect(
				withJson(runLot({ cwd: lot.start.repository, argv: ['status', lot.name, '--json'] })),
			).toMatchObject({ exitCode: 0, json: { state: 'working' } })
			expect(
				JSON.parse(inboxIn({ cwd: lot.start.repository, words: ['--json'] }).output),
			).toMatchObject({ damaged: [] })
		})
	},
)

describe('an id that names no folder of the store', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a store holding a damaged lot, an id naming another folder -> exit 2 saying no lot, not damaged', () => {
		const start = createStartWorkspace()
		const lot = damagedLotIn({ start, kind: 'identityMissing', name: DAMAGED_NAME })
		const unknown = '0099-repo-none'

		expect(runLot({ cwd: start.repository, argv: ['status', unknown] })).toEqual({
			exitCode: 2,
			output: `no lot ${unknown}`,
		})
		expect(
			runLot({ cwd: start.repository, argv: ['status', DAMAGED_NAME] }).output.split('\n'),
		).toEqual(damagedLines(lot))
	})
})
