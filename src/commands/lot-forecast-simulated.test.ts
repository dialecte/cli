/** `lot forecast` of a simulated lot: refused, naming it simulated (a simulated lot has no work to forecast). */
import { basename } from 'node:path'

import { startSimulated } from '../../test/simulated-lot.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { lotForecast } from './lot-forecast.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

describe('lot forecast of a simulated lot', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('lot forecast <id> of a simulated lot -> refused, exit 2, naming the lot simulated', () => {
		const simulated = startSimulated({ scenario: 'slow' })
		const lot = basename(simulated.lotFolder)

		expect(lotForecast({ cwd: simulated.start.cwd, argv: [lot] })).toEqual({
			exitCode: 2,
			output: expect.stringContaining(
				`lot forecast: ${lot} is simulated: only an open lot has a forecast`,
			),
		})
	})
})
