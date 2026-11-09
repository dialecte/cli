/**
 * The proof of S2 (33S section 13, G19): every scenario, run twice from one brief (two simulated
 * starts) through a loop of `wait` (injected clock and sleep) and `answer` (a fixed answer table), ends at its
 * predicted exit code; then a real `lot start` on the same scope still starts: simulated lots never block it.
 */
import { createStartWorkspace } from '../../test/lot-start-workspace.ts'
import { LOT_NAME } from '../../test/lot-start.constants.ts'
import {
	PREDICTED_ANSWERS,
	PREDICTED_CODES,
	SLOW_SHAPE,
} from '../../test/scenario-proof.constants.ts'
import { driveScenario, startRealLotOutcome, startScenarioLot } from '../../test/scenario-proof.ts'
import { loopShapeOf } from '../../test/simulated-lot.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { SCENARIOS } from '../lib/store/scenarios.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ScenarioRun } from '../../test/scenario-proof.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const SECOND_LOT = '0002-repo-dataflow-subscribe'

describe('every scenario, twice from one brief', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const scenario of Object.keys(SCENARIOS))
		it(`${scenario} -> both runs end at the predicted exit code with the predicted answers, then a real start makes its worktree`, async () => {
			const start = createStartWorkspace()
			const lots = [startScenarioLot({ start, scenario }), startScenarioLot({ start, scenario })]
			const runs: ScenarioRun[] = []
			for (const lot of lots) {
				const run = await driveScenario({ start, lot, scenario })
				runs.push(run)
			}

			expect(lots).toEqual([LOT_NAME, SECOND_LOT])
			expect(runs.map((run) => (scenario === 'slow' ? loopShapeOf(run.codes) : run.codes))).toEqual(
				scenario === 'slow'
					? [SLOW_SHAPE, SLOW_SHAPE]
					: [PREDICTED_CODES[scenario], PREDICTED_CODES[scenario]],
			)
			expect(runs.map((run) => run.answers)).toEqual([
				PREDICTED_ANSWERS[scenario],
				PREDICTED_ANSWERS[scenario],
			])
			expect(startRealLotOutcome(start)).toEqual({
				exitCode: 0,
				runner: 'manual',
				worktreeMade: true,
			})
		})
})
