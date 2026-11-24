/**
 * What the wiring of the forecast needs from the library (33CO CO2b): a refusal value for a lot with no forecast, lock
 * files never shared (decision Q2), and a recorded run whose event names its own trigger.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { replaceRecord } from '../../../test/damaged-lot-workspace.ts'
import {
	FORECAST_NOW,
	LOCK_A,
	OTHER_B,
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
import { LANDING_CHANGE_REQUEST_NUMBER } from '../../../test/landing-lot.constants.ts'
import { addLandingLot, landingLotOf, writeLandingRecord } from '../../../test/landing-lot.ts'
import { commitIn, mergeOnOrigin } from '../../../test/landing-repository.ts'
import { git } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { overlappingOpenLots, registryOfLotFolder } from '../store/lot-records.ts'
import { STORE_FILES } from '../store/store.constants.ts'
import { recordForecastRun } from './forecast-record.ts'
import { forecastLot } from './forecast.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ForecastTestLot } from '../../../test/forecast-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The forecast of the lot, run now. */
function forecastOf(lot: ForecastTestLot): unknown {
	return forecastLot({ lotFolder: lot.lotFolder, trigger: 'forecast', now: () => FORECAST_NOW })
}

/** The last event of the lot's folder. */
function lastEventOf(lot: ForecastTestLot): unknown {
	return readFileSync(join(lot.lotFolder, STORE_FILES.events), 'utf8')
		.split('\n')
		.filter((line) => line !== '')
		.map((line) => JSON.parse(line) as Record<string, unknown>)
		.at(-1)
}

describe('the library the wiring reads', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('another open lot squash-merged on origin and fetched, never closed -> not compared, named settled, no landed fact written', () => {
		const merged = landingLotOf()
		writeLandingRecord({ lot: merged, number: LANDING_CHANGE_REQUEST_NUMBER })
		mergeOnOrigin({ repository: merged.repository, how: 'squash' })
		const self = addLandingLot({ lot: merged, name: '0002-repo-y', branch: 'feat/y' })

		const run = forecastLot({
			lotFolder: self.lotFolder,
			trigger: 'forecast',
			now: () => FORECAST_NOW,
		})

		expect({
			compared: 'lines' in run && run.lines.some((line) => line.against === merged.name),
			settled: 'settled' in run ? run.settled.map((lot) => lot.name) : undefined,
			landed: existsSync(join(merged.lotFolder, 'landed.json')),
		}).toEqual({ compared: false, settled: [merged.name], landed: false })
	})

	it('another open lot squash-merged and fetched whose worktree holds a detached commit of its own -> compared, not settled', () => {
		const merged = landingLotOf()
		writeLandingRecord({ lot: merged, number: LANDING_CHANGE_REQUEST_NUMBER })
		mergeOnOrigin({ repository: merged.repository, how: 'squash' })
		git({ root: merged.worktree, args: ['switch', '-q', '--detach'] })
		commitIn({
			root: merged.worktree,
			files: { 'src/d.ts': 'export const detached = 1\n' },
			message: 'feat: detached',
		})
		const self = addLandingLot({ lot: merged, name: '0002-repo-y', branch: 'feat/y' })

		const run = forecastLot({
			lotFolder: self.lotFolder,
			trigger: 'forecast',
			now: () => FORECAST_NOW,
		})

		expect({
			compared: 'lines' in run && run.lines.some((line) => line.against === merged.name),
			settled: 'settled' in run ? run.settled.map((lot) => lot.name) : undefined,
		}).toEqual({ compared: true, settled: [] })
	})

	it('the forecast of a damaged lot -> a refusal value naming its damage, no throw, nothing written', () => {
		const workspace = createForecastWorkspace()
		const lot = startForecastLot({ workspace, feature: 'lot-a' })
		replaceRecord({ folder: lot.lotFolder, name: STORE_FILES.identity, text: '{' })

		expect(
			forecastLot({ lotFolder: lot.lotFolder, trigger: 'forecast', now: () => FORECAST_NOW }),
		).toEqual({
			refusal: expect.stringMatching(new RegExp(`^${lot.name} damaged: `)),
		})
	})

	it('two lots both changing a lock file that merges clean -> the pair reads exclusive', () => {
		const workspace = createForecastWorkspace()
		const first = startForecastLot({ workspace, feature: 'lot-a' })
		const second = startForecastLot({ workspace, feature: 'lot-b' })
		// the same new lock file on both sides: an add/add of identical content merges clean; the second lot changes one
		// more file, so the two works are not the same snapshot
		workInLot({ lot: first, files: { 'package-lock.json': LOCK_A } })
		workInLot({ lot: second, files: { 'package-lock.json': LOCK_A, 'src/other.ts': OTHER_B } })

		expect(forecastOf(first)).toMatchObject({
			verdict: 'exclusive',
			lines: [
				{ against: 'main', verdict: 'clean' },
				{
					against: second.name,
					verdict: 'exclusive',
					shared: ['package-lock.json'],
					conflicts: [],
				},
			],
		})
	})

	it('a met scope pair with a lock-file side -> the overlap names it exclusive', () => {
		const workspace = createForecastWorkspace()
		const lot = startForecastLot({
			workspace,
			feature: 'lot-a',
			scope: ['package-lock.json', 'src/'],
		})

		expect(
			overlappingOpenLots({
				store: dirname(lot.lotFolder),
				registry: registryOfLotFolder(lot.lotFolder),
				scope: ['package-lock.json', 'doc/'],
				caseInsensitive: false,
			}),
		).toEqual([
			{
				name: lot.name,
				met: ['package-lock.json meets package-lock.json'],
				exclusive: ['package-lock.json meets package-lock.json'],
			},
		])
	})

	it('a run recorded with trigger gate -> its lines written and its forecast event carries trigger gate', () => {
		const workspace = createForecastWorkspace()
		const lot = startForecastLot({ workspace, feature: 'lot-a' })

		const run = forecastLot({ lotFolder: lot.lotFolder, trigger: 'gate', now: () => FORECAST_NOW })
		if ('refusal' in run) throw new Error(run.refusal)

		expect(recordForecastRun({ lotFolder: lot.lotFolder, run, trigger: 'gate' })).toEqual({
			written: true,
			notes: [],
		})
		expect(lastEventOf(lot)).toMatchObject({ kind: 'forecast', trigger: 'gate', verdict: 'clean' })
	})

	it('two lots both changing a lock file, their one pair conflict also a main conflict of each -> the pair still reads exclusive', () => {
		const workspace = createForecastWorkspace()
		const first = startForecastLot({ workspace, feature: 'lot-a' })
		const second = startForecastLot({ workspace, feature: 'lot-b' })
		workInLot({
			lot: first,
			files: { 'package-lock.json': LOCK_A, 'src/shared.ts': SHARED_LINE2_A },
		})
		workInLot({
			lot: second,
			files: {
				'package-lock.json': LOCK_A,
				'src/shared.ts': SHARED_LINE2_B,
				'src/other.ts': OTHER_B,
			},
		})
		commitOnMain({ workspace, files: { 'src/shared.ts': SHARED_LINE2_MAIN } })

		expect(forecastOf(first)).toMatchObject({
			lines: [
				{ against: 'main', verdict: 'conflict' },
				{ against: second.name, verdict: 'exclusive', conflicts: [] },
			],
		})
	})
})
