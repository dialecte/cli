/** The forecast's comparisons: a lot's work against main and against each other open lot (33CO 4.3, 4.4). */
import { rmSync } from 'node:fs'
import { join } from 'node:path'

import {
	FORECAST_NOW,
	LOCK_A,
	LOCK_B,
	OTHER_B,
	SHARED_LINE10_B,
	SHARED_LINE1_A,
	SHARED_LINE2_A,
	SHARED_LINE2_B,
	SHARED_LINE2_MAIN,
} from '../../../test/forecast-workspace.constants.ts'
import {
	commitOnMain,
	createForecastWorkspace,
	startForecastLot,
	workInLot,
} from '../../../test/forecast-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { forecastLot } from './forecast.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ForecastTestLot, ForecastWorkspace } from '../../../test/forecast-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** One case: how lots A and B (and main) change the files, and what A's forecast says against main and against B. */
type CompareCase = {
	name: string
	work: (params: {
		workspace: ForecastWorkspace
		first: ForecastTestLot
		second: ForecastTestLot
	}) => void
	main: Record<string, unknown>
	pair: Record<string, unknown>
}

const CASES: readonly CompareCase[] = [
	{
		name: 'two lots editing different lines of one file -> pair clean, the file listed in shared',
		work({ first, second }) {
			workInLot({ lot: first, files: { 'src/shared.ts': SHARED_LINE1_A } })
			workInLot({ lot: second, files: { 'src/shared.ts': SHARED_LINE10_B }, commit: true })
		},
		main: { verdict: 'clean', shared: [], conflicts: [] },
		pair: { verdict: 'clean', shared: ['src/shared.ts'], conflicts: [] },
	},
	{
		name: 'two lots editing the same lines of one file -> pair conflict, kind content, the line ranges of the markers',
		work({ first, second }) {
			workInLot({ lot: first, files: { 'src/shared.ts': SHARED_LINE2_A } })
			workInLot({ lot: second, files: { 'src/shared.ts': SHARED_LINE2_B } })
		},
		main: { verdict: 'clean' },
		pair: {
			verdict: 'conflict',
			shared: ['src/shared.ts'],
			conflicts: [{ path: 'src/shared.ts', kind: 'content', lines: [[2, 6]] }],
		},
	},
	{
		name: 'one lot deletes a file the other edits -> conflict, kind modify/delete, no lines',
		work({ first, second }) {
			rmSync(join(first.worktree, 'src/other.ts'))
			workInLot({ lot: second, files: { 'src/other.ts': OTHER_B } })
		},
		main: { verdict: 'clean' },
		pair: {
			verdict: 'conflict',
			conflicts: [{ path: 'src/other.ts', kind: 'modify/delete', lines: [] }],
		},
	},
	{
		name: 'a lot whose change conflicts with a commit on main -> against main conflict, the pair with a lot not touching that file clean',
		work({ workspace, first, second }) {
			workInLot({ lot: first, files: { 'src/shared.ts': SHARED_LINE2_A } })
			workInLot({ lot: second, files: { 'src/other.ts': OTHER_B } })
			commitOnMain({ workspace, files: { 'src/shared.ts': SHARED_LINE2_MAIN } })
		},
		main: {
			verdict: 'conflict',
			shared: ['src/shared.ts'],
			conflicts: [{ path: 'src/shared.ts', kind: 'content', lines: [[2, 6]] }],
		},
		pair: { verdict: 'clean', shared: [], conflicts: [] },
	},
	{
		name: 'two lots both conflicting with main in the same file -> one main conflict per lot, no pair line for that file',
		work({ workspace, first, second }) {
			workInLot({ lot: first, files: { 'src/shared.ts': SHARED_LINE2_A } })
			workInLot({ lot: second, files: { 'src/shared.ts': SHARED_LINE2_B } })
			commitOnMain({ workspace, files: { 'src/shared.ts': SHARED_LINE2_MAIN } })
		},
		main: {
			verdict: 'conflict',
			conflicts: [{ path: 'src/shared.ts', kind: 'content', lines: [[2, 6]] }],
		},
		pair: { verdict: 'clean', shared: ['src/shared.ts'], conflicts: [] },
	},
	{
		name: 'two lots adding a lock file each -> pair exclusive, the lock file the only conflicted path',
		work({ first, second }) {
			workInLot({ lot: first, files: { 'package-lock.json': LOCK_A } })
			workInLot({ lot: second, files: { 'package-lock.json': LOCK_B } })
		},
		main: { verdict: 'clean' },
		pair: {
			verdict: 'exclusive',
			conflicts: [{ path: 'package-lock.json', kind: 'content' }],
		},
	},
]

describe(
	'the forecast of a lot against main and an open lot',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		for (const each of CASES) {
			it(each.name, () => {
				const workspace = createForecastWorkspace()
				const first = startForecastLot({ workspace, feature: 'lot-a' })
				const second = startForecastLot({ workspace, feature: 'lot-b' })
				each.work({ workspace, first, second })

				expect(
					forecastLot({ lotFolder: first.lotFolder, trigger: 'forecast', now: () => FORECAST_NOW }),
				).toMatchObject({
					lines: [
						{ against: 'main', ...each.main },
						{ against: second.name, ...each.pair },
					],
				})
			})
		}

		it('two lots both conflicting with main in the same file -> the other lot reads its own main conflict too', () => {
			const workspace = createForecastWorkspace()
			const first = startForecastLot({ workspace, feature: 'lot-a' })
			const second = startForecastLot({ workspace, feature: 'lot-b' })
			workInLot({ lot: first, files: { 'src/shared.ts': SHARED_LINE2_A } })
			workInLot({ lot: second, files: { 'src/shared.ts': SHARED_LINE2_B } })
			commitOnMain({ workspace, files: { 'src/shared.ts': SHARED_LINE2_MAIN } })

			expect(
				forecastLot({ lotFolder: second.lotFolder, trigger: 'forecast', now: () => FORECAST_NOW }),
			).toMatchObject({
				verdict: 'conflict',
				lines: [
					{ against: 'main', verdict: 'conflict' },
					{ against: first.name, verdict: 'clean' },
				],
			})
		})
	},
)
