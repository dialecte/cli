/** A forecast that cannot run in full never says clean: the comparison reads unknown with its reason (33CO 4.5). */
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import {
	FORECAST_NOW,
	OLD_GIT_STUB,
	SHORT_STEP_LIMIT_MS,
	STUB_SLEEP_SECONDS,
} from '../../../test/forecast-workspace.constants.ts'
import {
	createForecastWorkspace,
	startForecastLot,
	stubGit,
} from '../../../test/forecast-workspace.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { forecastLot } from './forecast.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** Whether a process of that pid still runs. */
function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0)
		return true
	} catch {
		return false
	}
}

describe('an unknown forecast', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('git without merge-tree --write-tree (a stub reporting 2.37) -> every comparison unknown with the version reason', () => {
		const workspace = createForecastWorkspace()
		const first = startForecastLot({ workspace, feature: 'lot-a' })
		const second = startForecastLot({ workspace, feature: 'lot-b' })
		stubGit({ script: OLD_GIT_STUB })

		const reason = 'git 2.37.0 has no merge-tree --write-tree (2.38 or later)'
		expect(
			forecastLot({ lotFolder: first.lotFolder, trigger: 'forecast', now: () => FORECAST_NOW }),
		).toMatchObject({
			verdict: 'unknown',
			lines: [
				{ against: 'main', verdict: 'unknown', reason },
				{ against: second.name, verdict: 'unknown', reason },
			],
		})
	})

	it('git printing a line that is no version (a stub) -> every comparison unknown, the raw text kept in the reason', () => {
		const workspace = createForecastWorkspace()
		const first = startForecastLot({ workspace, feature: 'lot-a' })
		stubGit({ script: `case " $* " in *" --version "*) echo "not git at all"; exit 0;; esac` })

		const reason = 'git not git at all has no merge-tree --write-tree (2.38 or later)'
		expect(
			forecastLot({ lotFolder: first.lotFolder, trigger: 'forecast', now: () => FORECAST_NOW }),
		).toMatchObject({
			verdict: 'unknown',
			lines: [{ against: 'main', verdict: 'unknown', reason }],
		})
	})

	it("the other lot's worktree folder removed -> that pair unknown, worktree of <lot> missing", () => {
		const workspace = createForecastWorkspace()
		const first = startForecastLot({ workspace, feature: 'lot-a' })
		const second = startForecastLot({ workspace, feature: 'lot-b' })
		rmSync(second.worktree, { recursive: true, force: true })

		expect(
			forecastLot({ lotFolder: first.lotFolder, trigger: 'forecast', now: () => FORECAST_NOW }),
		).toMatchObject({
			lines: [
				{ against: 'main', verdict: 'clean' },
				{ against: second.name, verdict: 'unknown', reason: `worktree of ${second.name} missing` },
			],
		})
	})

	it('merge-tree over the time limit (a stub that sleeps) -> unknown with the over-time reason, the child gone after the run', () => {
		const workspace = createForecastWorkspace()
		const first = startForecastLot({ workspace, feature: 'lot-a' })
		const pidFile = join(temporaryFolder('dialecte-forecast-pid-'), 'pid')
		stubGit({
			script: `case " $* " in *" merge-tree "*) echo $$ > "${pidFile}"; exec sleep ${STUB_SLEEP_SECONDS};; esac`,
		})

		expect(
			forecastLot({
				lotFolder: first.lotFolder,
				trigger: 'forecast',
				now: () => FORECAST_NOW,
				stepLimitMs: SHORT_STEP_LIMIT_MS,
			}),
		).toMatchObject({
			lines: [
				{ against: 'main', verdict: 'unknown', reason: `forecast of ${first.name} over 4 s` },
			],
		})
		expect(isAlive(Number(readFileSync(pidFile, 'utf8').trim()))).toBe(false)
	})
})
