/**
 * Step events of `dialecte lot delta <id> --round <n> --worktree` (33L0 section 4 "Which lot", case 13): a
 * `throwaway-add` in the lot `<id>` names, even when the command runs from another lot's worktree, its worktree the
 * new throwaway's real path, `throwaway: true`; the end after the throwaway exists; nothing without `--worktree`.
 */
import { existsSync, mkdirSync, realpathSync } from 'node:fs'

import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import { DELTA_NOW, OTHER_LOT_INDEX_LENGTH } from '../../test/step-events-delta.constants.ts'
import { createDeltaScene } from '../../test/step-events-delta.ts'
import { stepEventsOf } from '../../test/step-events-lot.ts'
import { spyOnWarnings } from '../../test/step-events-tdd.ts'
import { writeEvent } from '../lib/events/write-event.ts'
import { runLot } from './lot.ts'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** What the spy saw at each `step.end` append: the step, and whether the worktree it names existed then. */
const { endsSeen } = vi.hoisted(() => ({
	endsSeen: [] as { step: unknown; worktreeExists: boolean }[],
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
				endsSeen.push({ step: event.step, worktreeExists: existsSync(String(event.worktree)) })
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

/** `lot delta <index> --round <round> [--worktree] --json` run in `cwd`: the lot is named by its index. */
function delta(params: { cwd: string; name: string; worktree: boolean; round?: string }) {
	return runLot({
		cwd: params.cwd,
		argv: [
			'delta',
			params.name.slice(0, OTHER_LOT_INDEX_LENGTH),
			'--round',
			params.round ?? '2',
			...(params.worktree ? ['--worktree'] : []),
			'--json',
		],
		now: DELTA_NOW,
	})
}

/** The path of the throwaway a `--json` answer names. */
function throwawayOf(output: string): string {
	return realpathSync((JSON.parse(output) as { throwaway: { path: string } }).throwaway.path)
}

describe(
	'lot delta --worktree from another lot worktree (case 13)',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('the events go to the lot the id names, as one throwaway-add pair, never to the lot found from the folder', async () => {
			const { inLot, named } = createDeltaScene()

			const result = delta({ cwd: inLot.worktree, name: named.name, worktree: true })
			const inNamed = stepEventsOf({ eventsFile: named.eventsFile })
			const inFound = stepEventsOf(inLot)

			expect({
				exitCode: result.exitCode,
				kinds: inNamed.map((event) => event.kind),
				steps: inNamed.map((event) => event.step),
				lots: inNamed.map((event) => event.lot),
				by: inNamed.map((event) => event.by),
				paired: inNamed[0]?.run === inNamed[1]?.run && inNamed[0]?.run !== undefined,
				inFound,
			}).toEqual({
				exitCode: 0,
				kinds: ['step.start', 'step.end'],
				steps: ['throwaway-add', 'throwaway-add'],
				lots: [named.name, named.name],
				by: ['cli', 'cli'],
				paired: true,
				inFound: [],
			})
		})

		it('the end → the worktree is the real path of the new throwaway, throwaway true, not heavy; exit 0, a duration, no state hash', async () => {
			const { inLot, named } = createDeltaScene()

			const result = delta({ cwd: inLot.worktree, name: named.name, worktree: true })
			const [start, end] = stepEventsOf({ eventsFile: named.eventsFile })

			expect({
				sameWorktree: start?.worktree === end?.worktree,
				startThrowaway: start?.throwaway,
				throwaway: end?.throwaway,
				worktree: end?.worktree,
				heavy: end?.heavy,
				exit: end?.exit,
				duration: typeof end?.durationMs,
				stateHash: end?.stateHash,
			}).toEqual({
				sameWorktree: true,
				startThrowaway: true,
				throwaway: true,
				worktree: throwawayOf(result.output),
				heavy: false,
				exit: 0,
				duration: 'number',
				stateHash: null,
			})
		})

		it('the end is appended after the throwaway exists', async () => {
			const { inLot, named } = createDeltaScene()

			delta({ cwd: inLot.worktree, name: named.name, worktree: true })

			expect(endsSeen).toEqual([{ step: 'throwaway-add', worktreeExists: true }])
		})

		it('without --worktree no throwaway is made → no event in either lot', async () => {
			const { inLot, named } = createDeltaScene()

			vi.mocked(writeEvent).mockClear()

			const result = delta({ cwd: inLot.worktree, name: named.name, worktree: false })

			expect({
				exitCode: result.exitCode,
				writes: vi.mocked(writeEvent).mock.calls.length,
				inNamed: stepEventsOf({ eventsFile: named.eventsFile }),
				inFound: stepEventsOf(inLot),
			}).toEqual({ exitCode: 0, writes: 0, inNamed: [], inFound: [] })
		})

		it('a round whose previous round has no snapshot is refused before anything runs → exit 1, not one event written, no throwaway', async () => {
			const { inLot, named } = createDeltaScene()
			vi.mocked(writeEvent).mockClear()

			const result = delta({ cwd: inLot.worktree, name: named.name, worktree: true, round: '3' })

			expect({
				exitCode: result.exitCode,
				writes: vi.mocked(writeEvent).mock.calls.length,
				inNamed: stepEventsOf({ eventsFile: named.eventsFile }),
				inFound: stepEventsOf(inLot),
			}).toEqual({ exitCode: 1, writes: 0, inNamed: [], inFound: [] })
		})

		it('a folder stands at events.jsonl, in place of a read-only file → the same exit, the throwaway made, one warning line', async () => {
			const { inLot, named } = createDeltaScene()
			mkdirSync(named.eventsFile)
			const warnings = spyOnWarnings()

			const result = delta({ cwd: inLot.worktree, name: named.name, worktree: true })

			expect({
				exitCode: result.exitCode,
				throwawayMade: existsSync(throwawayOf(result.output)),
				warnings: warnings.lines.length,
			}).toEqual({ exitCode: 0, throwawayMade: true, warnings: 1 })
		})
	},
)
