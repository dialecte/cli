/** `lot forecast`: the forecast of the lot of the current worktree, its exit by verdict, `--json` the lines appended. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	FORECAST_NOW,
	OLD_GIT_STUB,
	SHARED_LINE2_A,
	SHARED_LINE2_MAIN,
} from '../../test/forecast-workspace.constants.ts'
import {
	commitOnMain,
	createForecastWorkspace,
	startForecastLot,
	stubGit,
	workInLot,
} from '../../test/forecast-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { readForecastRecord } from '../lib/coordination/forecast-record.ts'
import { lotForecast } from './lot-forecast.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ForecastTestLot, ForecastWorkspace } from '../../test/forecast-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const EXIT_CASES: readonly {
	verdict: string
	exitCode: number
	arrange: (params: { workspace: ForecastWorkspace; lot: ForecastTestLot }) => void
}[] = [
	{ verdict: 'clean', exitCode: 0, arrange() {} },
	{
		verdict: 'conflict',
		exitCode: 1,
		arrange({ workspace, lot }) {
			workInLot({ lot, files: { 'src/shared.ts': SHARED_LINE2_A } })
			commitOnMain({ workspace, files: { 'src/shared.ts': SHARED_LINE2_MAIN } })
		},
	},
	{
		verdict: 'unknown',
		exitCode: 3,
		arrange() {
			stubGit({ script: OLD_GIT_STUB })
		},
	},
]

describe('lot forecast', { timeout: STORE_CASE_TIMEOUT }, () => {
	it("lot forecast with no argument in a lot's worktree -> that lot's forecast, exit 0, 1 or 3 by verdict, and with --json the lines it appended", () => {
		expect(
			EXIT_CASES.map(function runCase(each) {
				const workspace = createForecastWorkspace()
				const lot = startForecastLot({ workspace, feature: 'lot-a' })
				each.arrange({ workspace, lot })
				const result = lotForecast({ cwd: lot.worktree, argv: [], now: FORECAST_NOW })
				vi.unstubAllEnvs()
				return {
					verdict: each.verdict,
					exitCode: result.exitCode,
					last: result.output.trim().split('\n').at(-1),
				}
			}),
		).toEqual(
			EXIT_CASES.map((each) => ({
				verdict: each.verdict,
				exitCode: each.exitCode,
				last: `forecast: ${each.verdict}`,
			})),
		)

		const workspace = createForecastWorkspace()
		const lot = startForecastLot({ workspace, feature: 'lot-json' })
		expect(
			JSON.parse(lotForecast({ cwd: lot.worktree, argv: ['--json'], now: FORECAST_NOW }).output),
		).toEqual({
			lot: lot.name,
			verdict: 'clean',
			lines: readForecastRecord({ lotFolder: lot.lotFolder }).lines,
		})
		// the start's own forecast came first (33CO CO2b), then the verb's
		expect(forecastEventsOf(lot.lotFolder).map((event) => event.trigger)).toEqual([
			'start',
			'forecast',
		])
		expect(forecastEventsOf(lot.lotFolder).at(-1)).toEqual({
			kind: 'forecast',
			trigger: 'forecast',
			verdict: 'clean',
			verdicts: { clean: 1, exclusive: 0, conflict: 0, unknown: 0 },
			durationMs: expect.any(Number),
		})
	})
})

describe('lot forecast, the lot and the other lot named', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('lot forecast <id> --against <lot> from outside every worktree -> that lot against main and the named lot only', () => {
		const workspace = createForecastWorkspace()
		const first = startForecastLot({ workspace, feature: 'lot-a' })
		const second = startForecastLot({ workspace, feature: 'lot-b' })
		startForecastLot({ workspace, feature: 'lot-c' })

		expect(
			JSON.parse(
				lotForecast({
					cwd: workspace.repository,
					argv: [first.name, '--against', second.name, '--json'],
					now: FORECAST_NOW,
				}).output,
			),
		).toMatchObject({ lot: first.name, lines: [{ against: 'main' }, { against: second.name }] })
	})

	it('lot forecast refusals -> exit 2: two ids, an unknown option, --against the lot itself, a folder no lot holds', () => {
		const workspace = createForecastWorkspace()
		const first = startForecastLot({ workspace, feature: 'lot-a' })
		const calls: { cwd: string; argv: string[] }[] = [
			{ cwd: first.worktree, argv: [first.name, 'extra'] },
			{ cwd: first.worktree, argv: ['--unknown'] },
			{ cwd: first.worktree, argv: ['--against', first.name] },
			{ cwd: workspace.repository, argv: [] },
		]

		expect(calls.map((call) => lotForecast({ ...call, now: FORECAST_NOW }).exitCode)).toEqual([
			2, 2, 2, 2,
		])
		// only the start's own run: a refused call appends none
		expect(
			readForecastRecord({ lotFolder: first.lotFolder }).lines.map((line) => line.trigger),
		).toEqual(['start'])
	})
})

/** The forecast events of the lot's events, each with its kind and its fields. */
function forecastEventsOf(lotFolder: string): Record<string, unknown>[] {
	return readFileSync(join(lotFolder, 'events.jsonl'), 'utf8')
		.split('\n')
		.filter((line) => line !== '')
		.map((line) => JSON.parse(line) as Record<string, unknown>)
		.filter((event) => event.kind === 'forecast')
		.map(({ kind, trigger, verdict, verdicts, durationMs }) => ({
			kind,
			trigger,
			verdict,
			verdicts,
			durationMs,
		}))
}
