/** `lot status --json` of a real lot shows no would-be refusal: `checks.wouldRefuse` is `[]` (R1-5). */
import { createStartWorkspace, withJson } from '../../test/lot-start-workspace.ts'
import { LOT_NAME, START_NOW } from '../../test/lot-start.constants.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

describe('lot status: a real lot', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a real start, then its status --json -> checks.wouldRefuse is []', () => {
		const start = createStartWorkspace()
		runLot({ cwd: start.cwd, argv: ['start', start.workspace.briefPath], now: START_NOW })

		expect(
			withJson(runLot({ cwd: start.repository, argv: ['status', LOT_NAME, '--json'] })).json,
		).toMatchObject({ checks: { wouldRefuse: [] } })
	})
})
