/** A path the lot itself conflicts on against main is left to its main line, never repeated on a pair line. */
import {
	SHARED_LINE1_MAIN,
	SHARED_LINE5_A,
	SHARED_LINES1TO5_B,
} from '../../../test/forecast-review.constants.ts'
import { FORECAST_NOW } from '../../../test/forecast-workspace.constants.ts'
import {
	commitOnMain,
	createForecastWorkspace,
	startForecastLot,
	workInLot,
} from '../../../test/forecast-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { forecastLot } from './forecast.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

describe(
	'the forecast of the lot that conflicts with main',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('only the lot itself conflicts with main in a file both lots conflict on -> the main line conflicts, the pair is clean', () => {
			const workspace = createForecastWorkspace()
			const first = startForecastLot({ workspace, feature: 'lot-a' })
			const second = startForecastLot({ workspace, feature: 'lot-b' })
			workInLot({ lot: first, files: { 'src/shared.ts': SHARED_LINE5_A } })
			workInLot({ lot: second, files: { 'src/shared.ts': SHARED_LINES1TO5_B } })
			commitOnMain({ workspace, files: { 'src/shared.ts': SHARED_LINE1_MAIN } })

			expect(
				forecastLot({ lotFolder: second.lotFolder, trigger: 'forecast', now: () => FORECAST_NOW }),
			).toMatchObject({
				lines: [
					{ against: 'main', verdict: 'conflict', conflicts: [{ path: 'src/shared.ts' }] },
					{ against: first.name, verdict: 'clean', conflicts: [], shared: ['src/shared.ts'] },
				],
			})
		})
	},
)
