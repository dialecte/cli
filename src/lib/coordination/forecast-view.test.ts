/** A lot's merged forecast view (33CO 4.6): a pair seen from both sides, the newer line winning; files only. */
import { rmSync } from 'node:fs'

import { SHARED_LINE2_A, SHARED_LINE2_B } from '../../../test/forecast-workspace.constants.ts'
import {
	createForecastWorkspace,
	startForecastLot,
	workInLot,
} from '../../../test/forecast-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { appendForecastRun } from './forecast-record.ts'
import { forecastStandingOf, forecastViewOf } from './forecast-view.ts'
import { forecastLot } from './forecast.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ForecastTestLot } from '../../../test/forecast-workspace.types.ts'
import type { ForecastView } from './forecast.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** Runs the lot's forecast at `at` and appends its lines to its record. */
function recordAt(params: { lot: ForecastTestLot; at: string }): void {
	const run = forecastLot({
		lotFolder: params.lot.lotFolder,
		trigger: 'forecast',
		now: () => new Date(params.at),
	})
	if ('refusal' in run) throw new Error(run.refusal)
	appendForecastRun({ lotFolder: params.lot.lotFolder, lines: run.lines })
}

/** What a view says of its main line and its pairs: against what, whose line, the verdict, the run's time. */
function summaryOf(view: ForecastView): unknown {
	return {
		main: view.main && { verdict: view.main.verdict, at: view.main.at },
		pairs: view.pairs.map((pair) => ({
			lot: pair.lot,
			from: pair.from,
			verdict: pair.line.verdict,
			at: pair.line.at,
		})),
	}
}

describe('the merged forecast view', { timeout: STORE_CASE_TIMEOUT }, () => {
	it("the second lot's own older line and the first lot's newer line naming it -> the second lot's view of the pair is the newer line", () => {
		const workspace = createForecastWorkspace()
		const first = startForecastLot({ workspace, feature: 'lot-a' })
		const second = startForecastLot({ workspace, feature: 'lot-b' })

		recordAt({ lot: second, at: '2026-11-17T12:00:00.000Z' })
		workInLot({ lot: first, files: { 'src/shared.ts': SHARED_LINE2_A } })
		workInLot({ lot: second, files: { 'src/shared.ts': SHARED_LINE2_B } })
		recordAt({ lot: first, at: '2026-11-17T13:00:00.000Z' })

		expect(summaryOf(forecastViewOf({ lotFolder: second.lotFolder }))).toEqual({
			main: { verdict: 'clean', at: '2026-11-17T12:00:00.000Z' },
			pairs: [
				{ lot: first.name, from: 'other', verdict: 'conflict', at: '2026-11-17T13:00:00.000Z' },
			],
		})
	})

	it("the second lot's own line newer than the first lot's -> its own line wins the pair", () => {
		const workspace = createForecastWorkspace()
		const first = startForecastLot({ workspace, feature: 'lot-a' })
		const second = startForecastLot({ workspace, feature: 'lot-b' })

		workInLot({ lot: first, files: { 'src/shared.ts': SHARED_LINE2_A } })
		workInLot({ lot: second, files: { 'src/shared.ts': SHARED_LINE2_B } })
		recordAt({ lot: first, at: '2026-11-17T13:00:00.000Z' })
		// the second lot moves its change away, then forecasts itself
		workInLot({ lot: second, files: { 'src/shared.ts': SHARED_LINE2_A } })
		recordAt({ lot: second, at: '2026-11-17T14:00:00.000Z' })

		expect([
			summaryOf(forecastViewOf({ lotFolder: first.lotFolder })),
			summaryOf(forecastViewOf({ lotFolder: second.lotFolder })),
		]).toEqual([
			{
				main: { verdict: 'clean', at: '2026-11-17T13:00:00.000Z' },
				pairs: [
					{ lot: second.name, from: 'other', verdict: 'clean', at: '2026-11-17T14:00:00.000Z' },
				],
			},
			{
				main: { verdict: 'clean', at: '2026-11-17T14:00:00.000Z' },
				pairs: [
					{ lot: first.name, from: 'self', verdict: 'clean', at: '2026-11-17T14:00:00.000Z' },
				],
			},
		])
	})

	it("an open lot whose main line is clean and whose pair with an unrelated lot reads unknown -> its standing is known, not unknown (that pair says nothing of the lot's own work)", () => {
		const workspace = createForecastWorkspace()
		const first = startForecastLot({ workspace, feature: 'lot-a' })
		const second = startForecastLot({ workspace, feature: 'lot-b' })
		rmSync(second.worktree, { recursive: true, force: true })
		recordAt({ lot: first, at: '2026-11-17T13:00:00.000Z' })

		expect(forecastStandingOf({ lotFolder: first.lotFolder })).toEqual({ conflicts: [] })
	})
})
