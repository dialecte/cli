/**
 * `lot report <lot>` of a terminal lot (DESIGN 3.9, test 52): while its worktree or its branch remains, its next line
 * names `dialecte lot prune <full name>` (the dry plan, never `--yes`); once nothing of it remains, no prune line.
 */
import {
	cancelLot,
	landingLotOf,
	removeBranchAndWorktree,
	removeLotWorktree,
	writeLandedFact,
} from '../../test/landing-lot.ts'
import { mergeOnOrigin } from '../../test/landing-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LandingLot } from '../../test/landing-lot.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The lot landed on main by a fast-forward, its landed fact written. */
function landLot(lot: LandingLot): void {
	mergeOnOrigin({ repository: lot.repository, how: 'fast-forward' })
	writeLandedFact({ lot, tip: lot.tip })
}

/** `next` of `lot report <lot> --json`, and whether any output names `--yes`. */
function nextOf(json: { output: string }): { next: unknown; yes: boolean } {
	return {
		next: (JSON.parse(json.output) as { next: unknown }).next,
		yes: json.output.includes('--yes'),
	}
}

const REMAINING: { title: string; arrange: (lot: LandingLot) => void }[] = [
	{ title: 'a landed lot, its worktree and branch still there', arrange: landLot },
	{
		title: 'a landed lot whose worktree went, its branch still there',
		arrange: (lot) => {
			landLot(lot)
			removeLotWorktree(lot)
		},
	},
	{ title: 'a canceled lot, its worktree and branch still there', arrange: cancelLot },
]

describe('lot report: the next line of a terminal lot', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of REMAINING)
		it(`${row.title} → next names dialecte lot prune <full name>, never --yes`, () => {
			const lot = landingLotOf()
			row.arrange(lot)

			expect(
				nextOf(runLot({ cwd: lot.workspace.repository, argv: ['report', lot.name, '--json'] })),
			).toEqual({ next: `dialecte lot prune ${lot.name}`, yes: false })
		})

	it('a landed lot whose worktree and branch are both gone → no prune line', () => {
		const lot = landingLotOf()
		landLot(lot)
		removeBranchAndWorktree(lot)

		expect(
			nextOf(runLot({ cwd: lot.workspace.repository, argv: ['report', lot.name, '--json'] })),
		).toEqual({ next: null, yes: false })
	})
})
