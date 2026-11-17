/** The forecast behaviours the pull request review pinned: the verdict order, the step limit, the main filters, a foreign worktree, two fixes. */
import { rmSync } from 'node:fs'

import {
	DECIDED_STEP_LIMIT_MS,
	SHARED_LINE1_MAIN,
	SHARED_LINE5_A,
	SHARED_LINES1TO5_B,
	SLOW_VERSION_STUB,
	VERSION_STEP_LIMIT_MS,
} from '../../../test/forecast-review.constants.ts'
import {
	FORECAST_NOW,
	SHARED_LINE2_A,
	SHARED_LINE2_B,
} from '../../../test/forecast-workspace.constants.ts'
import {
	commitOnMain,
	createForecastWorkspace,
	startForecastLot,
	stubGit,
	workInLot,
} from '../../../test/forecast-workspace.ts'
import { initializeRepository } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { FORECAST_STEP_LIMIT_MS } from './forecast.constants.ts'
import { forecastLot } from './forecast.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

describe('the forecast, as the review pinned it', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a run with a conflict line and an unknown line -> the verdict is unknown', () => {
		const workspace = createForecastWorkspace()
		const first = startForecastLot({ workspace, feature: 'lot-a' })
		const second = startForecastLot({ workspace, feature: 'lot-b' })
		const third = startForecastLot({ workspace, feature: 'lot-c' })
		workInLot({ lot: first, files: { 'src/shared.ts': SHARED_LINE2_A } })
		workInLot({ lot: second, files: { 'src/shared.ts': SHARED_LINE2_B } })
		rmSync(third.worktree, { recursive: true, force: true })

		expect(
			forecastLot({ lotFolder: first.lotFolder, trigger: 'forecast', now: () => FORECAST_NOW }),
		).toMatchObject({
			verdict: 'unknown',
			lines: [
				{ against: 'main', verdict: 'clean' },
				{ against: second.name, verdict: 'conflict' },
				{ against: third.name, verdict: 'unknown' },
			],
		})
	})

	it('the step limit of every git step -> 20 seconds', () => {
		expect(FORECAST_STEP_LIMIT_MS).toBe(DECIDED_STEP_LIMIT_MS)
	})

	it('only the other lot conflicts with main in a file both lots conflict on -> the pair is clean, the main line clean', () => {
		const workspace = createForecastWorkspace()
		const first = startForecastLot({ workspace, feature: 'lot-a' })
		const second = startForecastLot({ workspace, feature: 'lot-b' })
		workInLot({ lot: first, files: { 'src/shared.ts': SHARED_LINE5_A } })
		workInLot({ lot: second, files: { 'src/shared.ts': SHARED_LINES1TO5_B } })
		commitOnMain({ workspace, files: { 'src/shared.ts': SHARED_LINE1_MAIN } })

		expect(
			forecastLot({ lotFolder: first.lotFolder, trigger: 'forecast', now: () => FORECAST_NOW }),
		).toMatchObject({
			lines: [
				{ against: 'main', verdict: 'clean', conflicts: [] },
				{ against: second.name, verdict: 'clean', conflicts: [], shared: ['src/shared.ts'] },
			],
		})
	})

	it("the other lot's worktree folder holding another repository -> that pair unknown, worktree of <lot> missing", () => {
		const workspace = createForecastWorkspace()
		const first = startForecastLot({ workspace, feature: 'lot-a' })
		const second = startForecastLot({ workspace, feature: 'lot-b' })
		rmSync(second.worktree, { recursive: true, force: true })
		initializeRepository({ root: second.worktree })

		expect(
			forecastLot({ lotFolder: first.lotFolder, trigger: 'forecast', now: () => FORECAST_NOW }),
		).toMatchObject({
			lines: [
				{ against: 'main', verdict: 'clean' },
				{ against: second.name, verdict: 'unknown', reason: `worktree of ${second.name} missing` },
			],
		})
	})

	it('git --version over the step limit -> every comparison unknown with the over-time reason', () => {
		const workspace = createForecastWorkspace()
		const first = startForecastLot({ workspace, feature: 'lot-a' })
		stubGit({ script: SLOW_VERSION_STUB })

		expect(
			forecastLot({
				lotFolder: first.lotFolder,
				trigger: 'forecast',
				now: () => FORECAST_NOW,
				stepLimitMs: VERSION_STEP_LIMIT_MS,
			}),
		).toMatchObject({
			lines: [
				{ against: 'main', verdict: 'unknown', reason: `forecast of ${first.name} over 2 s` },
			],
		})
	})

	it("the lot's own worktree folder removed -> the main line names origin's base branch and its commit", () => {
		const workspace = createForecastWorkspace()
		const first = startForecastLot({ workspace, feature: 'lot-a' })
		rmSync(first.worktree, { recursive: true, force: true })

		expect(
			forecastLot({ lotFolder: first.lotFolder, trigger: 'forecast', now: () => FORECAST_NOW }),
		).toMatchObject({
			lines: [
				{
					against: 'main',
					verdict: 'unknown',
					reason: `worktree of ${first.name} missing`,
					main: { ref: 'origin/main', commit: expect.stringMatching(/^[0-9a-f]{40}$/) },
				},
			],
		})
	})
})
