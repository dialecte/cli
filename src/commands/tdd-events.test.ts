/**
 * Step events of `dialecte tdd red` and `tdd green` (33L0 section 4 "Step events", "Which lot"; D9, D12): one
 * `step.start` and one `step.end` in the lot of the worktree, the end written after the tdd ledger entry, nothing in
 * a plain checkout. The package is a scratch one that tests with the cli's own vitest (the receipts need a real run).
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { commonGitDirOf } from '../../test/scratch-tree.ts'
import { ledgerKindsOf } from '../../test/step-events-ledger.ts'
import { STEP_LOT } from '../../test/step-events-lot.constants.ts'
import { createStepLot, eventsOfStep, stepEventsOf } from '../../test/step-events-lot.ts'
import { ADD_CODE, ADD_FILE, ADD_STUB, TDD_NOW } from '../../test/step-events-tdd.constants.ts'
import {
	createPlainTddCheckout,
	createTddLot,
	linkVitest,
	spyOnWarnings,
} from '../../test/step-events-tdd.ts'
import { HELPER_SCENARIO_TIMEOUT } from '../../test/test-timing.constants.ts'
import { writeEvent } from '../lib/events/write-event.ts'
import { STORE_FOLDER } from '../lib/store/store.constants.ts'
import { runTdd } from './tdd.ts'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { StepLot } from '../../test/step-events-lot.types.ts'

/** What the spy saw at each `step.end` append: the step, and what the tdd ledger of the worktree held then. */
const { endsSeen } = vi.hoisted(() => ({
	endsSeen: [] as { step: unknown; hasRed: boolean; hasGreen: boolean }[],
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
			if (event.kind === 'step.end') {
				const kinds = ledgerKindsOf(String(event.worktree))
				endsSeen.push({
					step: event.step,
					hasRed: kinds.includes('red'),
					hasGreen: kinds.includes('green'),
				})
			}
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

function tdd(params: { cwd: string; argv: string[] }) {
	return runTdd({ cwd: params.cwd, argv: params.argv, now: () => TDD_NOW })
}

describe('tdd red and green in a lot worktree', { timeout: HELPER_SCENARIO_TIMEOUT }, () => {
	it('tdd red → exactly one step.start and one step.end of tdd-red in the lot, by the cli, paired by run', async () => {
		const lot = createTddLot()

		const result = await tdd({ cwd: lot.worktree, argv: ['red'] })
		const events = stepEventsOf(lot)

		expect({
			exitCode: result.exitCode,
			kinds: events.map((event) => event.kind),
			steps: events.map((event) => event.step),
			lots: events.map((event) => event.lot),
			by: events.map((event) => event.by),
			paired: events[0]?.run === events[1]?.run && events[0]?.run !== undefined,
		}).toEqual({
			exitCode: 0,
			kinds: ['step.start', 'step.end'],
			steps: ['tdd-red', 'tdd-red'],
			lots: [STEP_LOT, STEP_LOT],
			by: ['cli', 'cli'],
			paired: true,
		})
	})

	it('tdd red → both events say not heavy, the worktree real path, not a throwaway; the end has exit, a duration, no state hash and no parts', async () => {
		const lot = createTddLot()

		await tdd({ cwd: lot.worktree, argv: ['red'] })
		const [start, end] = eventsOfStep({ lot, step: 'tdd-red' })

		expect({
			sameWorktree: start?.worktree === end?.worktree,
			startPlace: [start?.heavy, start?.worktree, start?.throwaway],
			endPlace: [end?.heavy, end?.worktree, end?.throwaway],
			exit: end?.exit,
			duration: typeof end?.durationMs,
			stateHash: end?.stateHash,
			parts: end?.parts ?? [],
			outcome: end?.outcome,
		}).toEqual({
			sameWorktree: true,
			startPlace: [false, lot.worktree, false],
			endPlace: [false, lot.worktree, false],
			exit: 0,
			duration: 'number',
			stateHash: null,
			parts: [],
			outcome: undefined,
		})
	})

	it('tdd green after a red and the production code → one more pair, of tdd-green, in the same lot', async () => {
		const lot = createTddLot()
		await tdd({ cwd: lot.worktree, argv: ['red'] })
		writeFileSync(join(lot.worktree, ADD_FILE), ADD_CODE)

		const result = await tdd({ cwd: lot.worktree, argv: ['green'] })
		const green = eventsOfStep({ lot, step: 'tdd-green' })

		expect({
			exitCode: result.exitCode,
			kinds: green.map((event) => event.kind),
			lots: green.map((event) => event.lot),
			heavy: green.map((event) => event.heavy),
			exit: green[1]?.exit,
			stateHash: green[1]?.stateHash,
			paired: green[0]?.run === green[1]?.run && green[0]?.run !== undefined,
			redEvents: eventsOfStep({ lot, step: 'tdd-red' }).length,
		}).toEqual({
			exitCode: 0,
			kinds: ['step.start', 'step.end'],
			lots: [STEP_LOT, STEP_LOT],
			heavy: [false, false],
			exit: 0,
			stateHash: null,
			paired: true,
			redEvents: 2,
		})
	})

	it('tdd red on a test that already passes (refused: it proves nothing) → the step ran: its end carries the exit 1, and no red receipt is in the ledger', async () => {
		const lot = createTddLot({ implemented: true })

		const result = await tdd({ cwd: lot.worktree, argv: ['red'] })
		const events = eventsOfStep({ lot, step: 'tdd-red' })

		expect({
			exitCode: result.exitCode,
			kinds: events.map((event) => event.kind),
			exit: events[1]?.exit,
			redReceipt: ledgerKindsOf(lot.worktree).includes('red'),
		}).toEqual({
			exitCode: 1,
			kinds: ['step.start', 'step.end'],
			exit: 1,
			redReceipt: false,
		})
	})
})

describe('tdd refused before it runs', { timeout: HELPER_SCENARIO_TIMEOUT }, () => {
	it('a subcommand that does not exist → exit 2, no step ran: not one event written', async () => {
		const lot = createTddLot()
		vi.mocked(writeEvent).mockClear()

		const result = await tdd({ cwd: lot.worktree, argv: ['bogus'] })

		expect({
			exitCode: result.exitCode,
			writes: vi.mocked(writeEvent).mock.calls.length,
			events: stepEventsOf(lot),
		}).toEqual({ exitCode: 2, writes: 0, events: [] })
	})

	it('tdd red with no test file new or changed → exit 1 as before, not one event written', async () => {
		const lot = createLotWithoutTest()
		vi.mocked(writeEvent).mockClear()

		const result = await tdd({ cwd: lot.worktree, argv: ['red'] })

		expect({
			exitCode: result.exitCode,
			refused: result.output.startsWith('tdd red: no test file new or changed'),
			writes: vi.mocked(writeEvent).mock.calls.length,
			events: stepEventsOf(lot),
		}).toEqual({ exitCode: 1, refused: true, writes: 0, events: [] })
	})

	it('tdd red with an unreadable lot file → exit 1 as before, not one event written', async () => {
		const lot = createTddLot()
		mkdirSync(join(lot.worktree, '.dialecte'), { recursive: true })
		writeFileSync(join(lot.worktree, '.dialecte', 'lot.json'), JSON.stringify({ revised: [5] }))
		vi.mocked(writeEvent).mockClear()

		const result = await tdd({ cwd: lot.worktree, argv: ['red'] })

		expect({
			exitCode: result.exitCode,
			refused: result.output.startsWith('tdd red: .dialecte/lot.json'),
			writes: vi.mocked(writeEvent).mock.calls.length,
			events: stepEventsOf(lot),
		}).toEqual({ exitCode: 1, refused: true, writes: 0, events: [] })
	})

	it('tdd green with no test file new or changed → exit 1 as before, not one event written', async () => {
		const lot = createLotWithoutTest()
		vi.mocked(writeEvent).mockClear()

		const result = await tdd({ cwd: lot.worktree, argv: ['green'] })

		expect({
			exitCode: result.exitCode,
			refused: result.output.startsWith('tdd green: no test file new or changed'),
			writes: vi.mocked(writeEvent).mock.calls.length,
			events: stepEventsOf(lot),
		}).toEqual({ exitCode: 1, refused: true, writes: 0, events: [] })
	})

	it('tdd green after test code changed since the last red → exit 1 as before, no event written by the green', async () => {
		const lot = createTddLot()
		await tdd({ cwd: lot.worktree, argv: ['red'] })
		mkdirSync(join(lot.worktree, 'test'), { recursive: true })
		writeFileSync(join(lot.worktree, 'test', 'expected.ts'), 'export const EXPECTED = 2\n')
		vi.mocked(writeEvent).mockClear()

		const result = await tdd({ cwd: lot.worktree, argv: ['green'] })

		expect({
			exitCode: result.exitCode,
			refused: result.output.startsWith('tdd green: test code changed since the last red run'),
			writes: vi.mocked(writeEvent).mock.calls.length,
			greenEvents: eventsOfStep({ lot, step: 'tdd-green' }),
		}).toEqual({ exitCode: 1, refused: true, writes: 0, greenEvents: [] })
	})
})

/** A lot worktree whose package commits the stub and holds no test file at all (nothing new or changed to run). */
function createLotWithoutTest(): StepLot {
	const lot = createStepLot({ extraPackage: { type: 'module' }, files: { [ADD_FILE]: ADD_STUB } })
	linkVitest(lot.worktree)
	return lot
}

describe(
	'tdd: the end follows the ledger entry (D12)',
	{ timeout: HELPER_SCENARIO_TIMEOUT },
	() => {
		it('tdd red then tdd green → the red receipt is in the ledger when the tdd-red end is appended, the green receipt when the tdd-green end is', async () => {
			const lot = createTddLot()

			await tdd({ cwd: lot.worktree, argv: ['red'] })
			writeFileSync(join(lot.worktree, ADD_FILE), ADD_CODE)
			await tdd({ cwd: lot.worktree, argv: ['green'] })

			expect(endsSeen).toEqual([
				{ step: 'tdd-red', hasRed: true, hasGreen: false },
				{ step: 'tdd-green', hasRed: true, hasGreen: true },
			])
			expect(ledgerKindsOf(lot.worktree)).toContain('green')
		})
	},
)

describe('tdd in a plain checkout', { timeout: HELPER_SCENARIO_TIMEOUT }, () => {
	it('tdd red outside any lot → the same result, no event, no store folder, no warning', async () => {
		const root = createPlainTddCheckout()
		const warnings = spyOnWarnings()
		vi.mocked(writeEvent).mockClear()

		const result = await tdd({ cwd: root, argv: ['red'] })

		expect({
			exitCode: result.exitCode,
			eventWrites: vi.mocked(writeEvent).mock.calls.length,
			store: existsSync(join(commonGitDirOf(root), STORE_FOLDER)),
			warnings: warnings.lines,
		}).toEqual({ exitCode: 0, eventWrites: 0, store: false, warnings: [] })
	})
})

describe('tdd: events that cannot be written', { timeout: HELPER_SCENARIO_TIMEOUT }, () => {
	it('a folder stands at events.jsonl, in place of a read-only file → tdd red has the same exit and output, one warning line', async () => {
		const reference = createTddLot()
		const blocked = createTddLot()
		mkdirSync(blocked.eventsFile)
		const warnings = spyOnWarnings()

		const expected = await tdd({ cwd: reference.worktree, argv: ['red'] })
		const result = await tdd({ cwd: blocked.worktree, argv: ['red'] })

		expect({
			// the output names no path of either lot: it can be compared across the two
			pathFree:
				!expected.output.includes(reference.worktree) && !result.output.includes(blocked.worktree),
			same: result.exitCode === expected.exitCode && result.output === expected.output,
			exitCode: result.exitCode,
			warnings: warnings.lines.length,
		}).toEqual({ pathFree: true, same: true, exitCode: 0, warnings: 1 })
	})
})
