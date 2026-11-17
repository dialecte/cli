/**
 * `lot start` with the forecast (33CO 4.1, 4.2, decision Q5): a scope meeting an open lot whose work reads goes ahead,
 * the shared entries named; an exclusive path (a lock file, Q2) or a forecast that cannot run still refuses, as the
 * scope rule of today, and `--overlap-ok` passes them.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { briefWith, writeStoreLot } from '../../test/brief-workspace.ts'
import { FORECAST_NOW } from '../../test/forecast-workspace.constants.ts'
import { createForecastWorkspace, startForecastLot } from '../../test/forecast-workspace.ts'
import { createStartWorkspace } from '../../test/lot-start-workspace.ts'
import { RECORD_TIME } from '../../test/store-records.constants.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { buildScopeLine } from '../lib/gate-records/card-gates.ts'
import { STORE_FILES } from '../lib/store/store.constants.ts'
import { startLot } from './lot-start.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ForecastWorkspace } from '../../test/forecast-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** A minute after the store fixtures' lots were published: such a lot with no worktree yet is still starting. */
const JUST_AFTER_RECORD = new Date(Date.parse(RECORD_TIME) + 60_000)

/** A lot that publishes while the start runs, its worktree not made yet. */
const RACER_LOT = '0099-repo-racer'

const GO_AHEAD = ['--overlap-ok', '--by', 'reviewer', '--reason', 'lines apart in one file']

/** Writes the brief of `feature` with `scope` and starts it with the extra words; the output and the new lot's folder. */
function startBrief(params: {
	workspace: ForecastWorkspace
	feature: string
	scope: string[]
	extra?: string[]
}): { exitCode: number; output: string; lotFolder: string | undefined } {
	const { workspace, feature, scope } = params
	const briefPath = join(workspace.briefFolder, `${feature}.json`)
	writeFileSync(
		briefPath,
		`${JSON.stringify(
			briefWith({
				feature,
				branch: `feat/${feature}`,
				scope,
				lots: [{ paths: scope, message: `feat: ${feature}` }],
			}),
			null,
			2,
		)}\n`,
	)
	const started = startLot({
		cwd: workspace.workspace,
		argv: [briefPath, ...(params.extra ?? [])],
		now: FORECAST_NOW,
	})
	const output = started.output ?? ''
	return {
		exitCode: started.exitCode,
		output,
		lotFolder: /^folder: (.+)$/m.exec(output)?.[1],
	}
}

/** The triggers of the runs a lot folder's `forecast.jsonl` holds, one per line. */
function forecastTriggersOf(lotFolder: string | undefined): string[] {
	if (lotFolder === undefined) return []
	const file = join(lotFolder, STORE_FILES.forecast)
	if (!existsSync(file)) return []
	return readFileSync(file, 'utf8')
		.split('\n')
		.filter((line) => line !== '')
		.map((line) => (JSON.parse(line) as { trigger: string }).trigger)
}

describe('lot start with the forecast', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('lot start whose scope meets an open lot with readable work -> started without --overlap-ok, the shared entry named with forecast clean, its start forecast recorded, no overlaps.jsonl', () => {
		const workspace = createForecastWorkspace()
		const open = startForecastLot({ workspace, feature: 'lot-a' })

		const started = startBrief({ workspace, feature: 'lot-b', scope: ['src/shared.ts'] })

		expect({
			exitCode: started.exitCode,
			shares: started.output.split('\n').filter((line) => line.startsWith('shares ')),
			triggers: forecastTriggersOf(started.lotFolder),
			overlaps: existsSync(join(started.lotFolder ?? '', STORE_FILES.overlaps)),
		}).toEqual({
			exitCode: 0,
			shares: [`shares src/shared.ts meets src with ${open.name} (forecast clean)`],
			triggers: ['start', 'start'],
			overlaps: false,
		})
	})

	it('lot start meeting an open lot on a lock file -> refused naming the exclusive path', () => {
		const workspace = createForecastWorkspace()
		const open = startForecastLot({ workspace, feature: 'lot-a', scope: ['package-lock.json'] })

		const started = startBrief({ workspace, feature: 'lot-b', scope: ['package-lock.json'] })

		expect({ exitCode: started.exitCode, output: started.output }).toEqual({
			exitCode: 2,
			output: expect.stringContaining(
				`overlap with ${open.name}: package-lock.json meets package-lock.json (exclusive: a lock file is never shared)`,
			),
		})
	})

	it('lot start --overlap-ok where the forecast clears -> started, recorded, and the line --overlap-ok not needed', () => {
		const workspace = createForecastWorkspace()
		const open = startForecastLot({ workspace, feature: 'lot-a' })

		const started = startBrief({
			workspace,
			feature: 'lot-b',
			scope: ['src/shared.ts'],
			extra: GO_AHEAD,
		})

		expect({
			exitCode: started.exitCode,
			notNeeded: started.output.split('\n').filter((line) => line.startsWith('--overlap-ok')),
			overlaps: existsSync(join(started.lotFolder ?? '', STORE_FILES.overlaps)),
		}).toEqual({
			exitCode: 0,
			notNeeded: [`--overlap-ok not needed: the forecast cleared ${open.name}`],
			overlaps: true,
		})
	})

	it("lot start meeting an open lot whose worktree is gone -> refused with the forecast's unknown reason", () => {
		const workspace = createForecastWorkspace()
		const open = startForecastLot({ workspace, feature: 'lot-a' })
		rmSync(open.worktree, { recursive: true, force: true })

		const started = startBrief({ workspace, feature: 'lot-b', scope: ['src/shared.ts'] })

		expect({ exitCode: started.exitCode, output: started.output }).toEqual({
			exitCode: 2,
			output: expect.stringContaining(
				`overlap with ${open.name}: src/shared.ts meets src (forecast unknown: worktree of ${open.name} missing)`,
			),
		})
	})

	it('lot start meeting an open lot on a lock file, with --overlap-ok -> started, the overlap recorded', () => {
		const workspace = createForecastWorkspace()
		const open = startForecastLot({ workspace, feature: 'lot-a', scope: ['package-lock.json'] })

		const started = startBrief({
			workspace,
			feature: 'lot-b',
			scope: ['package-lock.json'],
			extra: GO_AHEAD,
		})

		expect({
			exitCode: started.exitCode,
			overlaps: readFileSync(join(started.lotFolder ?? '', STORE_FILES.overlaps), 'utf8'),
			notNeeded: started.output.includes('--overlap-ok not needed'),
		}).toEqual({
			exitCode: 0,
			overlaps: expect.stringContaining(`"lot":"${open.name}"`),
			notNeeded: false,
		})
	})

	it("right after a start the forecast cleared -> the new lot's card scope line shares the entry with forecast clean", () => {
		const workspace = createForecastWorkspace()
		const open = startForecastLot({ workspace, feature: 'lot-a' })

		const started = startBrief({ workspace, feature: 'lot-b', scope: ['src/shared.ts'] })

		expect(buildScopeLine({ folder: started.lotFolder ?? '', now: FORECAST_NOW })).toEqual({
			name: 'scope',
			status: 'passed',
			detail: `shares src/shared.ts meets src with ${open.name} (forecast clean, 0 min ago)`,
		})
	})

	it('a lot meeting the brief starts between the check and the re-check, no worktree made yet -> it has no work: the start goes on (decision Q5)', () => {
		const start = createStartWorkspace()

		const started = startLot({
			cwd: start.cwd,
			argv: [start.workspace.briefPath],
			now: JUST_AFTER_RECORD,
			seams: {
				afterClaimPick: function racerPublishes() {
					writeStoreLot({ workspace: start.workspace, name: RACER_LOT, scope: ['src/dataflow'] })
				},
			},
		})

		expect({ exitCode: started.exitCode, failed: started.output.includes(RACER_LOT) }).toEqual({
			exitCode: 0,
			failed: false,
		})
	})

	it('a met lot published a minute before the start, its worktree not made yet -> it has no work: the pre-check lets the start go on (decision Q5)', () => {
		const start = createStartWorkspace()
		writeStoreLot({ workspace: start.workspace, name: RACER_LOT, scope: ['src/dataflow'] })

		const started = startLot({
			cwd: start.cwd,
			argv: [start.workspace.briefPath],
			now: JUST_AFTER_RECORD,
		})

		expect({
			exitCode: started.exitCode,
			refused: started.output.includes(`overlap with ${RACER_LOT}`),
		}).toEqual({
			exitCode: 0,
			refused: false,
		})
	})
})
