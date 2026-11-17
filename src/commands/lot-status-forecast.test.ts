/**
 * The card and `lot status` read the forecast (33CO 4.6, decision Q6), files only: a pair seen from either side, the
 * newer line winning, a `conflicts` line on both cards only while the pair collides, the shared entries on the scope
 * line, and `lot status --json` carrying the merged view.
 */
import { SHARED_LINE2_A, SHARED_LINE2_B } from '../../test/forecast-workspace.constants.ts'
import {
	createForecastWorkspace,
	startForecastLot,
	workInLot,
} from '../../test/forecast-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { recordForecastRun } from '../lib/coordination/forecast-record.ts'
import { forecastLot } from '../lib/coordination/forecast.ts'
import { buildForecastLine, buildScopeLine } from '../lib/gate-records/card-gates.ts'
import { lotStatus } from './lot-status.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ForecastTestLot } from '../../test/forecast-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The card's clock: two hours after the first run. */
const CARD_NOW = new Date('2026-11-17T15:00:00.000Z')

/** Runs and records the lot's forecast at `at` under `trigger`. */
function recordAt(params: {
	lot: ForecastTestLot
	at: string
	trigger: 'gate' | 'forecast'
}): void {
	const run = forecastLot({
		lotFolder: params.lot.lotFolder,
		trigger: params.trigger,
		now: () => new Date(params.at),
	})
	if ('refusal' in run) throw new Error(run.refusal)
	recordForecastRun({ lotFolder: params.lot.lotFolder, run, trigger: params.trigger })
}

/** Two lots whose work collides in `src/shared.ts`, the first lot's gate having found it at 13:00. */
function collidingLots(): { first: ForecastTestLot; second: ForecastTestLot } {
	const workspace = createForecastWorkspace()
	const first = startForecastLot({ workspace, feature: 'lot-a' })
	const second = startForecastLot({ workspace, feature: 'lot-b' })
	workInLot({ lot: first, files: { 'src/shared.ts': SHARED_LINE2_A } })
	workInLot({ lot: second, files: { 'src/shared.ts': SHARED_LINE2_B } })
	recordAt({ lot: first, at: '2026-11-17T13:00:00.000Z', trigger: 'gate' })
	return { first, second }
}

describe('the card and lot status read the forecast', { timeout: STORE_CASE_TIMEOUT }, () => {
	it("the first lot's gate found the conflict -> both lots' cards show a conflicts line naming the other lot", () => {
		const { first, second } = collidingLots()

		expect([
			buildForecastLine({ folder: first.lotFolder, now: CARD_NOW }),
			buildForecastLine({ folder: second.lotFolder, now: CARD_NOW }),
		]).toEqual([
			{
				name: 'conflicts',
				status: 'warning',
				detail: `${second.name}: forecast conflict: src/shared.ts:2-6 (content) (2 h ago)`,
			},
			{
				name: 'conflicts',
				status: 'warning',
				detail: `${first.name}: forecast conflict: src/shared.ts:2-6 (content) (2 h ago)`,
			},
		])
	})

	it("the second lot's later own forecast is clean -> both cards show the newer clean result: no conflicts line, the scope line shares with forecast clean", () => {
		const { first, second } = collidingLots()
		// the second lot moves its change onto the first lot's lines, then forecasts itself
		workInLot({ lot: second, files: { 'src/shared.ts': SHARED_LINE2_A } })
		recordAt({ lot: second, at: '2026-11-17T14:00:00.000Z', trigger: 'forecast' })

		expect({
			conflicts: [
				buildForecastLine({ folder: first.lotFolder, now: CARD_NOW }),
				buildForecastLine({ folder: second.lotFolder, now: CARD_NOW }),
			],
			scope: buildScopeLine({ folder: second.lotFolder, now: CARD_NOW })?.detail,
		}).toEqual({
			conflicts: [undefined, undefined],
			scope: expect.stringContaining(
				`shares src meets src with ${first.name} (forecast clean, 1 h ago)`,
			),
		})
	})

	it('lot status --json -> forecast holds the merged view: the main line and the pair from the other side', () => {
		const { first, second } = collidingLots()

		expect(
			JSON.parse(lotStatus({ cwd: second.worktree, argv: [second.name, '--json'] }).output)
				.forecast,
		).toMatchObject({
			main: { against: 'main', trigger: 'start' },
			pairs: [{ lot: first.name, from: 'other', line: { verdict: 'conflict', trigger: 'gate' } }],
		})
	})
})
