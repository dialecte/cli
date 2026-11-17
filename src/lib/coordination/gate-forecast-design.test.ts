/** The gate's forecast block names the lot's design standing (DESIGN-GATE section 3, DG2). */
import { createForecastWorkspace, startForecastLot } from '../../../test/forecast-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { runGateForecast } from './gate-forecast.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

describe("the gate's forecast block - the design", { timeout: STORE_CASE_TIMEOUT }, () => {
	it("a lot that needs no design -> the block's text holds design not required", () => {
		const workspace = createForecastWorkspace()
		const lot = startForecastLot({ workspace, feature: 'one' })

		expect(runGateForecast({ cwd: lot.worktree })?.text).toContain('design not required')
	})
})
