/**
 * `lot prune` over store lots whose worktree is gone, and over a feature's lots (DESIGN 3.2 "which lots", 3.10 item 3,
 * test 40): a lot whose landing is not provable is listed stale with the person's `lot stop` command and nothing
 * written; one whose landing its hand-over's card proves gets its landed fact; `--feature <name>` reads that feature's
 * lots only.
 */
import {
	addLandingLot,
	closedHandoverOf,
	landingLotOf,
	removeBranchAndWorktree,
	writeHandoverCard,
} from '../../test/landing-lot.ts'
import { mergeOnOrigin } from '../../test/landing-repository.ts'
import { lotPruneArgumentsOf, prunedLotOf, pruneRunOf } from '../../test/lot-prune-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { readLanded } from '../lib/landing/landed-record.ts'
import { runLotPrune } from './lot-prune.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LandingLot } from '../../test/landing-lot.types.ts'
import type { CommandResult } from '../lib/command-result.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The stale line of a working lot `lot`, whatever the reason its landing is not provable. */
function staleLineOf(lot: string): RegExp {
	return new RegExp(
		`^stale: worktree gone, still working: .+; if its work is abandoned: dialecte lot stop ${lot}$`,
	)
}

const NOT_PROVABLE: { title: string; arrange: (lot: LandingLot) => void }[] = [
	{ title: 'no card line, no branch', arrange: () => undefined },
	{
		title: 'a closed hand-over’s card at a head the base never took',
		arrange: (lot) => {
			const handover = closedHandoverOf(lot)
			writeHandoverCard({ lot, handover, head: lot.tip, offset: 1000 })
		},
	},
]

describe('lot prune: a store lot whose worktree is gone', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of NOT_PROVABLE)
		it(`a working lot, branch and worktree gone, ${row.title} → listed stale with the lot stop command, nothing written`, () => {
			const lot = landingLotOf()
			row.arrange(lot)
			removeBranchAndWorktree(lot)

			expect(
				((result: CommandResult) => ({
					exitCode: result.exitCode,
					stale: prunedLotOf({ result, lot: lot.name })?.stale,
					landed: readLanded({ lotFolder: lot.lotFolder }),
				}))(runLotPrune(lotPruneArgumentsOf({ lot, argv: [] }))),
			).toEqual({
				exitCode: 0,
				stale: expect.stringMatching(staleLineOf(lot.name)),
				landed: undefined,
			})
		})

	it('the same with the closed hand-over’s card at a head the base holds → its landed fact recorded, read landed with its worktree gone, not stale', () => {
		const lot = landingLotOf()
		const handover = closedHandoverOf(lot)
		writeHandoverCard({ lot, handover, head: lot.tip, offset: 1000 })
		mergeOnOrigin({ repository: lot.repository, how: 'fast-forward' })
		removeBranchAndWorktree(lot)

		expect(
			((result: CommandResult) => ({
				lot: prunedLotOf({ result, lot: lot.name }),
				landed: readLanded({ lotFolder: lot.lotFolder }),
			}))(runLotPrune(lotPruneArgumentsOf({ lot, argv: [] }))),
		).toEqual({
			lot: {
				lot: lot.name,
				state: 'committed',
				landing: expect.stringContaining('worktree gone'),
				simulated: false,
			},
			landed: expect.objectContaining({ tip: lot.tip }),
		})
	})
})

describe('lot prune --feature: the lots of a feature', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('two lots of the feature and one of another beside the first lot → only the feature’s two listed', () => {
		const lot = landingLotOf()
		const first = addLandingLot({
			lot,
			name: '0002-repo-alpha',
			branch: 'feat/alpha',
			feature: 'alpha',
		})
		const second = addLandingLot({
			lot,
			name: '0003-repo-alpha-two',
			branch: 'feat/alpha-two',
			feature: 'alpha',
		})
		addLandingLot({ lot, name: '0004-repo-beta', branch: 'feat/beta', feature: 'beta' })

		expect(
			pruneRunOf(runLotPrune(lotPruneArgumentsOf({ lot, argv: ['--feature', 'alpha'] })))
				.output.lots.map((one) => one.lot)
				.sort(),
		).toEqual([first.name, second.name])
	})
})
