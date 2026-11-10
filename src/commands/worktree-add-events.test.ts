/**
 * Step events of `worktree add` (33L0 section 4 "Step events", "Which lot", case 13): a `worktree-add` in the lot
 * `lot start` makes (passed in, never found from the folder the command runs in), its parts saying how
 * `node_modules` came (pooled, cloned or none) and that `npm ci` never ran; `worktree add` by hand records nothing,
 * even inside a lot's worktree.
 */
import { existsSync, realpathSync } from 'node:fs'
import { join } from 'node:path'

import { briefWith, writeBriefFile } from '../../test/brief-workspace.ts'
import { LOT_NAME } from '../../test/lot-start.constants.ts'
import { START_NOW } from '../../test/lot-start.constants.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import { stepEventsOf } from '../../test/step-events-lot.ts'
import { spyOnWarnings } from '../../test/step-events-tdd.ts'
import {
	COPIED_PACKAGE_FILE,
	POOL_ENTRY_NAME,
	SECOND_BRIEF,
	SECOND_LOT_NAME,
	WORKTREE_NOW,
} from '../../test/step-events-worktree.constants.ts'
import { createWorktreeScene, stubCloneRefusingCp } from '../../test/step-events-worktree.ts'
import { writeEvent } from '../lib/events/write-event.ts'
import { STORE_FILES } from '../lib/store/store.constants.ts'
import { runLot } from './lot.ts'
import { runWorktreeAdd } from './worktree.ts'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { NodeModulesVariant } from '../../test/step-events-worktree.types.ts'

/** What the spy saw at each `step.end` append, and whether the next write is made to fail (a folder at the file). */
const { endsSeen, failure } = vi.hoisted(() => ({
	endsSeen: [] as { step: unknown; worktreeExists: boolean }[],
	failure: { on: false },
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
			if (failure.on)
				throw Object.assign(
					new Error(`EISDIR: illegal operation on a directory, open '${params.file}'`),
					{
						code: 'EISDIR',
					},
				)
			if (event.kind === 'step.end')
				endsSeen.push({ step: event.step, worktreeExists: existsSync(String(event.worktree)) })
			return actual.writeEvent(params)
		}),
	}
})

beforeEach(function clearSpy() {
	endsSeen.length = 0
	failure.on = false
	vi.mocked(writeEvent).mockClear()
})

afterEach(function restoreEnvironment() {
	vi.restoreAllMocks()
	vi.unstubAllEnvs()
})

/** The lots of the scene's store by name: where each events file is. */
function eventsOf(params: { store: string; lot: string }) {
	return stepEventsOf({ eventsFile: join(params.store, params.lot, STORE_FILES.events) })
}

describe('lot start: the worktree it adds', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	const VARIANTS: NodeModulesVariant[] = ['none', 'cloned', 'pooled']

	for (const variant of VARIANTS)
		it(`started from the main checkout, node_modules ${variant} → one worktree-add pair in the new lot, the parts saying ${variant} and no npm ci`, () => {
			const start = createWorktreeScene({ variant })

			const result = runLot({
				cwd: start.repository,
				argv: ['start', start.workspace.briefPath],
				now: START_NOW,
			})
			const events = eventsOf({ store: start.store, lot: LOT_NAME })
			const worktree = realpathSync(join(start.worktreesFolder, LOT_NAME))

			expect({
				exitCode: result.exitCode,
				kinds: events.map((event) => event.kind),
				steps: events.map((event) => event.step),
				lots: events.map((event) => event.lot),
				by: events.map((event) => event.by),
				paired: events[0]?.run === events[1]?.run && events[0]?.run !== undefined,
				sameWorktree: events[0]?.worktree === events[1]?.worktree,
				worktree: events[1]?.worktree,
				throwaway: events[1]?.throwaway,
				heavy: events[1]?.heavy,
				exit: events[1]?.exit,
				duration: typeof events[1]?.durationMs,
				stateHash: events[1]?.stateHash,
				parts: events[1]?.parts,
				nodeModulesInWorktree: existsSync(join(worktree, 'node_modules')),
				poolEntryLeft: existsSync(join(start.worktreesFolder, POOL_ENTRY_NAME)),
			}).toEqual({
				exitCode: 0,
				kinds: ['step.start', 'step.end'],
				steps: ['worktree-add', 'worktree-add'],
				lots: [LOT_NAME, LOT_NAME],
				by: ['cli', 'cli'],
				paired: true,
				sameWorktree: true,
				worktree,
				throwaway: false,
				heavy: false,
				exit: 0,
				duration: 'number',
				stateHash: null,
				parts: { nodeModules: variant, npmCi: false },
				nodeModulesInWorktree: variant !== 'none',
				poolEntryLeft: false,
			})
		})

	it('a file system that refuses copy-on-write (the plain cp is the fallback) → the parts still say cloned', () => {
		const start = createWorktreeScene({ variant: 'cloned' })
		stubCloneRefusingCp()

		const result = runLot({
			cwd: start.repository,
			argv: ['start', start.workspace.briefPath],
			now: START_NOW,
		})
		const events = eventsOf({ store: start.store, lot: LOT_NAME })

		expect({
			exitCode: result.exitCode,
			copied: existsSync(join(start.worktreesFolder, LOT_NAME, COPIED_PACKAGE_FILE)),
			parts: events[1]?.parts,
		}).toEqual({ exitCode: 0, copied: true, parts: { nodeModules: 'cloned', npmCi: false } })
	})

	it('the end is appended after the worktree exists', () => {
		const start = createWorktreeScene({ variant: 'none' })

		runLot({ cwd: start.repository, argv: ['start', start.workspace.briefPath], now: START_NOW })

		expect(endsSeen).toEqual([{ step: 'worktree-add', worktreeExists: true }])
	})

	it('a second lot started from inside the first lot worktree (case 13) → its worktree-add is in the second lot, the first keeps its own one pair', () => {
		const start = createWorktreeScene({ variant: 'none' })
		runLot({ cwd: start.repository, argv: ['start', start.workspace.briefPath], now: START_NOW })
		const firstWorktree = realpathSync(join(start.worktreesFolder, LOT_NAME))
		writeBriefFile({ workspace: start.workspace, brief: briefWith(SECOND_BRIEF) })

		const result = runLot({
			cwd: firstWorktree,
			argv: ['start', start.workspace.briefPath],
			now: START_NOW,
		})
		const second = eventsOf({ store: start.store, lot: SECOND_LOT_NAME })
		const first = eventsOf({ store: start.store, lot: LOT_NAME })

		expect({
			exitCode: result.exitCode,
			second: second.map((event) => [event.kind, event.step, event.lot]),
			secondWorktree: second[1]?.worktree,
			first: first.map((event) => [event.kind, event.step, event.lot]),
		}).toEqual({
			exitCode: 0,
			second: [
				['step.start', 'worktree-add', SECOND_LOT_NAME],
				['step.end', 'worktree-add', SECOND_LOT_NAME],
			],
			secondWorktree: realpathSync(join(start.worktreesFolder, SECOND_LOT_NAME)),
			first: [
				['step.start', 'worktree-add', LOT_NAME],
				['step.end', 'worktree-add', LOT_NAME],
			],
		})
	})

	it('the event file cannot be written → the same exit, the lot started and its worktree made, one warning line', () => {
		const start = createWorktreeScene({ variant: 'none' })
		failure.on = true
		const warnings = spyOnWarnings()

		const result = runLot({
			cwd: start.repository,
			argv: ['start', start.workspace.briefPath],
			now: START_NOW,
		})

		expect({
			exitCode: result.exitCode,
			worktreeMade: existsSync(join(start.worktreesFolder, LOT_NAME)),
			warnings: warnings.lines.length,
		}).toEqual({ exitCode: 0, worktreeMade: true, warnings: 1 })
	})
})

describe('worktree add by hand', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('from the main checkout → a worktree, no event in any lot', () => {
		const start = createWorktreeScene({ variant: 'none' })
		vi.mocked(writeEvent).mockClear()

		const result = runWorktreeAdd({
			argv: [start.repository, 'feat/by-hand'],
			cwd: start.repository,
			now: WORKTREE_NOW,
			colour: false,
		})

		expect({
			exitCode: result.exitCode,
			eventWrites: vi.mocked(writeEvent).mock.calls.length,
			storeMade: existsSync(start.store),
		}).toEqual({ exitCode: 0, eventWrites: 0, storeMade: false })
	})

	it('from inside a lot worktree → a worktree, still no event, neither in that lot nor anywhere', () => {
		const start = createWorktreeScene({ variant: 'none' })
		runLot({ cwd: start.repository, argv: ['start', start.workspace.briefPath], now: START_NOW })
		const lotWorktree = realpathSync(join(start.worktreesFolder, LOT_NAME))
		const before = eventsOf({ store: start.store, lot: LOT_NAME }).length
		vi.mocked(writeEvent).mockClear()

		const result = runWorktreeAdd({
			argv: [start.repository, 'feat/by-hand'],
			cwd: lotWorktree,
			now: WORKTREE_NOW,
			colour: false,
		})

		expect({
			exitCode: result.exitCode,
			eventsInLot: eventsOf({ store: start.store, lot: LOT_NAME }).length - before,
			writes: vi.mocked(writeEvent).mock.calls.length,
		}).toEqual({ exitCode: 0, eventsInLot: 0, writes: 0 })
	})
})
