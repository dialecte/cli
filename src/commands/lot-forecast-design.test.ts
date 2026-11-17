/** `lot forecast` names the lot's design standing after its comparisons (DESIGN-GATE section 1). */
import { createForecastWorkspace, startForecastLot } from '../../test/forecast-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

describe('lot forecast - the design', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a lot that needs no design -> the text ends with design not required', () => {
		const workspace = createForecastWorkspace()
		const lot = startForecastLot({ workspace, feature: 'one' })

		expect(
			runLot({ cwd: workspace.repository, argv: ['forecast', lot.name] }).output.split('\n'),
		).toContain('design not required')
	})
})
