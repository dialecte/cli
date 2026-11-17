/**
 * `plan next` holds by forecast, not by scope (33CO 4.6): a ready lot meeting an open lot whose forecast is known and
 * clears the met entries is proposed with `shares`; a conflict inside the met entries, a met lock file, or an open lot
 * with no known forecast (fails closed: the scope rule answers) still holds it. Two ready lots that meet are both
 * proposed. Files only: the facts carry each store lot's forecast as read from its records.
 */
import { SHARED_LINE2_A, SHARED_LINE2_B } from '../../../test/forecast-workspace.constants.ts'
import {
	createForecastWorkspace,
	startForecastLot,
	workInLot,
} from '../../../test/forecast-workspace.ts'
import { blockOf, branchOf, factsOf, lotOf, storeLotOf } from '../../../test/plan-state-facts.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { recordForecastRun } from '../coordination/forecast-record.ts'
import { forecastLot } from '../coordination/forecast.ts'
import { entryStates } from './entry-state.ts'
import { proposePlan } from './propose.ts'
import { readPlanFacts } from './read-plan-facts.ts'

import { describe, expect, it } from 'vitest'

import type { PlanLotForecast } from './plan.types.ts'
import type { PlanProposals } from './propose.types.ts'

/** The proposals of a block whose entry `Open` is open through a store lot holding `src/Open/` with `forecast`. */
function proposalsWith(params: {
	forecast: PlanLotForecast | undefined
	candidate: string[]
}): PlanProposals {
	const block = blockOf({
		lots: [
			lotOf('Open', { scope: { cli: ['src/Open/'] } }),
			lotOf('W', { scope: { cli: params.candidate } }),
		],
	})
	const facts = factsOf({
		repositories: {
			cli: {
				storeLots: [
					storeLotOf({
						name: '0001-cli-open',
						branch: branchOf('Open'),
						scope: ['src/Open/'],
						...(params.forecast && { forecast: params.forecast }),
					}),
				],
			},
		},
	})
	return proposePlan({
		block,
		facts,
		states: entryStates({ block, facts }),
		heavy: { markers: [] },
	})
}

/** What the answer says of the candidate W: proposed with its shares, or held with its met pairs. */
function candidateOf(proposals: PlanProposals): unknown {
	return {
		proposed: proposals.proposals
			.filter((proposal) => proposal.id === 'W')
			.map((proposal) => ({ shares: proposal.shares })),
		held: proposals.held.filter((held) => held.id === 'W').map((held) => held.met),
	}
}

describe('plan next holds by forecast', () => {
	it('a ready lot meeting an open lot whose last forecast is clean -> proposed with shares', () => {
		expect(
			candidateOf(proposalsWith({ forecast: { conflicts: [] }, candidate: ['src/Open/x.ts'] })),
		).toEqual({
			proposed: [{ shares: ['src/Open/x.ts meets src/Open/ (Open, forecast clean)'] }],
			held: [],
		})
	})

	it('a ready lot meeting an open lot whose last forecast conflicts outside the met entries -> proposed with shares', () => {
		expect(
			candidateOf(
				proposalsWith({ forecast: { conflicts: ['src/Open/y.ts'] }, candidate: ['src/Open/x.ts'] }),
			),
		).toEqual({
			proposed: [{ shares: ['src/Open/x.ts meets src/Open/ (Open, forecast clean)'] }],
			held: [],
		})
	})

	it("the open lot's last forecast shows a conflict inside the met entry -> held, naming it", () => {
		expect(
			candidateOf(
				proposalsWith({ forecast: { conflicts: ['src/Open/x.ts'] }, candidate: ['src/Open/x.ts'] }),
			),
		).toEqual({
			proposed: [],
			held: [['src/Open/x.ts meets src/Open/ (Open, open, forecast conflict in src/Open/x.ts)']],
		})
	})

	it('two ready lots that meet each other -> both proposed, neither after the other', () => {
		const block = blockOf({
			lots: [
				lotOf('A', { scope: { cli: ['src/shared/'] } }),
				lotOf('B', { scope: { cli: ['src/shared/'] } }),
			],
		})
		const facts = factsOf({})

		expect(
			proposePlan({
				block,
				facts,
				states: entryStates({ block, facts }),
				heavy: { markers: [] },
			}).proposals.map((proposal) => ({ id: proposal.id, after: 'after' in proposal })),
		).toEqual([
			{ id: 'A', after: false },
			{ id: 'B', after: false },
		])
	})
})

describe('plan next reads each store lot forecast', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a store lot whose recorded forecast conflicts with another lot -> its fact carries the conflict paths, read from files only', () => {
		const workspace = createForecastWorkspace()
		const first = startForecastLot({ workspace, feature: 'lot-a' })
		const second = startForecastLot({ workspace, feature: 'lot-b' })
		workInLot({ lot: first, files: { 'src/shared.ts': SHARED_LINE2_A } })
		workInLot({ lot: second, files: { 'src/shared.ts': SHARED_LINE2_B } })
		const run = forecastLot({ lotFolder: first.lotFolder, trigger: 'gate' })
		if ('refusal' in run) throw new Error(run.refusal)
		recordForecastRun({ lotFolder: first.lotFolder, run, trigger: 'gate' })
		const read = readPlanFacts({
			block: { ...blockOf({ lots: [] }), repositories: { cli: workspace.repository } },
		}).repositories.cli
		expect(
			read?.readable === true
				? read.storeLots.map((lot) => ({ name: lot.name, forecast: lot.forecast }))
				: read,
		).toEqual([
			{ name: first.name, forecast: { conflicts: ['src/shared.ts'] } },
			{ name: second.name, forecast: { conflicts: ['src/shared.ts'] } },
		])
	})
})
