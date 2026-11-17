import { FORECAST_NOW, LOCK_A, LOCK_B } from '../../test/forecast-workspace.constants.ts'
import {
	createForecastWorkspace,
	startForecastLot,
	workInLot,
} from '../../test/forecast-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { lotForecast } from './lot-forecast.ts'
/** `lot forecast` as the review pinned it: a closed lot refused, an exclusive verdict's exit. */
import { lotStop } from './lot-stop.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The exit and the last line of a call, or the error it threw. */
function outcomeOf(call: () => { exitCode: number; output: string }): Record<string, unknown> {
	try {
		const result = call()
		return { exitCode: result.exitCode, last: result.output.trim().split('\n').at(-1) }
	} catch (error) {
		return { thrown: (error as Error).message }
	}
}

describe('lot forecast, as the review pinned it', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('lot forecast <id> of a stopped lot -> refused, exit 2, naming the lot as not open', () => {
		const workspace = createForecastWorkspace()
		const lot = startForecastLot({ workspace, feature: 'lot-a' })
		lotStop({
			cwd: workspace.workspace,
			argv: [lot.name, '--reason', 'not needed', '--by', 'reviewer'],
			now: FORECAST_NOW,
		})

		expect(
			outcomeOf(() =>
				lotForecast({ cwd: workspace.workspace, argv: [lot.name], now: FORECAST_NOW }),
			),
		).toEqual({
			exitCode: 2,
			last: `lot forecast: ${lot.name} is canceled: only an open lot has a forecast`,
		})
	})

	it('lot forecast where every conflict is a lock file -> verdict exclusive, exit 1', () => {
		const workspace = createForecastWorkspace()
		const first = startForecastLot({ workspace, feature: 'lot-a' })
		const second = startForecastLot({ workspace, feature: 'lot-b' })
		workInLot({ lot: first, files: { 'package-lock.json': LOCK_A } })
		workInLot({ lot: second, files: { 'package-lock.json': LOCK_B } })

		expect(
			outcomeOf(() => lotForecast({ cwd: first.worktree, argv: [], now: FORECAST_NOW })),
		).toEqual({ exitCode: 1, last: 'forecast: exclusive' })
	})
})
