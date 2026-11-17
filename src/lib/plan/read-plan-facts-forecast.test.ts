/**
 * `plan next` reads each store lot's forecast from files only (33CO 4.2, behaviour 24): reading the facts of lots that
 * hold forecast records starts no child process.
 */
import { SHARED_LINE2_A, SHARED_LINE2_B } from '../../../test/forecast-workspace.constants.ts'
import {
	createForecastWorkspace,
	startForecastLot,
	workInLot,
} from '../../../test/forecast-workspace.ts'
import { blockOf } from '../../../test/plan-state-facts.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { recordForecastRun } from '../coordination/forecast-record.ts'
import { forecastLot } from '../coordination/forecast.ts'
import { readPlanFacts } from './read-plan-facts.ts'

import { describe, expect, it, vi } from 'vitest'

/** The child processes started while `counting.on` holds, by the synchronous and the async spawners. */
const counting = vi.hoisted(() => ({ on: false, spawned: 0 }))

vi.mock('node:child_process', async function countingChildProcess(importOriginal) {
	const actual = await importOriginal<typeof import('node:child_process')>()
	function counted<Spawner extends (...args: never[]) => unknown>(spawner: Spawner): Spawner {
		return function countedSpawner(...args: Parameters<Spawner>) {
			if (counting.on) counting.spawned += 1
			return spawner(...args)
		} as Spawner
	}
	return {
		...actual,
		spawnSync: counted(actual.spawnSync),
		execFileSync: counted(actual.execFileSync),
		execSync: counted(actual.execSync),
		spawn: counted(actual.spawn),
		execFile: counted(actual.execFile),
	}
})

describe('plan next reads the forecast from files only', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('the facts of two open lots holding forecast records -> each lot carries its forecast, no child process started', () => {
		const workspace = createForecastWorkspace()
		const first = startForecastLot({ workspace, feature: 'lot-a' })
		const second = startForecastLot({ workspace, feature: 'lot-b' })
		workInLot({ lot: first, files: { 'src/shared.ts': SHARED_LINE2_A } })
		workInLot({ lot: second, files: { 'src/shared.ts': SHARED_LINE2_B } })
		const run = forecastLot({ lotFolder: first.lotFolder, trigger: 'gate' })
		if ('refusal' in run) throw new Error(run.refusal)
		recordForecastRun({ lotFolder: first.lotFolder, run, trigger: 'gate' })

		counting.on = true
		const read = readPlanFacts({
			block: { ...blockOf({ lots: [] }), repositories: { cli: workspace.repository } },
		}).repositories.cli
		counting.on = false

		expect({
			spawned: counting.spawned,
			forecasts:
				read?.readable === true ? read.storeLots.map((lot) => lot.forecast !== undefined) : read,
		}).toEqual({ spawned: 0, forecasts: [true, true] })
	})
})
