/**
 * A lot's hand-made throwaways under `lot prune --yes`, real git (DESIGN 3.4b, tests 46, 54, 55): a worktree no lot
 * and no registry entry names, cut by hand at a commit of a terminal lot (its creation commit the `%H` of its branch's
 * oldest reflog entry), holding no commit of its own the lot never took, goes with its lot when every changed path is
 * held by a commit; one holding a change no commit holds is kept, naming it; any other is not the lot's, untouched.
 */
import { chmodSync, existsSync, realpathSync } from 'node:fs'
import { join } from 'node:path'

import {
	LANDING_LOT_FILE,
	LANDING_LOT_TEXT,
	LANDING_NOW,
} from '../../../test/landing-lot.constants.ts'
import { landingLotOf, writeLandedFact } from '../../../test/landing-lot.ts'
import { commitIn, mergeOnOrigin } from '../../../test/landing-repository.ts'
import { lotPruneArgumentsOf, prunedItemsOf } from '../../../test/lot-prune-workspace.ts'
import { git, temporaryFolder, writeFiles } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { runLotPrune } from '../../commands/lot-prune.ts'
import {
	handoverStoreOf,
	recordHandoverState,
	registerHandover,
} from '../handover/handover-store.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LandingLot } from '../../../test/landing-lot.types.ts'
import type { PrunedItems } from '../../../test/lot-prune-workspace.types.ts'
import type { CommandResult } from '../command-result.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The hand-made throwaway's branch, as a reviewer names a red check. */
const RED_CHECK = 'red-check'

/** A trash path, whatever its time stamp. */
const TRASHED = expect.stringMatching(/\/\.worktrees\/_trash\//)

/** A landed lot (fast-forward on origin, its landed fact) and a worktree cut by hand at its tip on `red-check`. */
function landedLotWithRedCheck(): { lot: LandingLot; handMade: string } {
	const lot = landedLot()
	return { lot, handMade: addRedCheck({ lot, from: lot.tip }) }
}

/** A store lot landed by a fast-forward on origin, its landed fact written. */
function landedLot(): LandingLot {
	const lot = landingLotOf()
	mergeOnOrigin({ repository: lot.repository, how: 'fast-forward' })
	writeLandedFact({ lot, tip: lot.tip })
	return lot
}

/** The fate of a hand-made throwaway holding `src/x.ts` in a version no commit holds: kept, the path named. */
function heldNowhere(lot: LandingLot): { item: PrunedItems[string]; there: boolean } {
	const reason = `hand-made throwaway of ${lot.name}: 1 path(s) held nowhere, first: ${LANDING_LOT_FILE}`
	return { item: { decision: { kept: reason }, outcome: { kept: reason } }, there: true }
}

/** A worktree `.worktrees/0009-repo-red-check` on a new branch `red-check` cut at `from`: its real path. */
function addRedCheck(params: { lot: LandingLot; from: string }): string {
	const path = join(params.lot.workspace.workspace, '.worktrees', '0009-repo-red-check')
	git({
		root: params.lot.workspace.repository,
		args: ['worktree', 'add', '-q', '-b', RED_CHECK, path, params.from],
	})
	return realpathSync(path)
}

/** The hand-made worktree's item in the lot's part of a run (undefined when it is not the lot's), and whether it is still there. */
function handMadeFateOf(params: { result: CommandResult; lot: LandingLot; handMade: string }): {
	item: PrunedItems[string] | undefined
	there: boolean
} {
	return {
		item: prunedItemsOf({ result: params.result, lot: params.lot.name })[
			`throwaway ${params.handMade}`
		],
		there: existsSync(params.handMade),
	}
}

/** A version of the lot's file no commit holds. */
const HELD_NOWHERE_TEXT = 'export const x = 99\n'

const HAND_MADE: {
	title: string
	arrange: (params: { lot: LandingLot; handMade: string }) => void
	fate: (lot: LandingLot) => { item: PrunedItems[string] | undefined; there: boolean }
}[] = [
	{
		title: 'clean, no commit of its own → goes with its lot',
		arrange: () => undefined,
		fate: () => ({ item: { decision: { go: true }, outcome: { removed: TRASHED } }, there: false }),
	},
	{
		title: 'holding a modified file no commit holds → kept, held nowhere, the path named',
		arrange: ({ handMade }) =>
			writeFiles({ root: handMade, files: { [LANDING_LOT_FILE]: HELD_NOWHERE_TEXT } }),
		fate: heldNowhere,
	},
	{
		title:
			'a staged version no commit holds while its working file equals the lot’s tip → kept, held nowhere, the path named',
		arrange: ({ handMade }) => {
			writeFiles({ root: handMade, files: { [LANDING_LOT_FILE]: HELD_NOWHERE_TEXT } })
			git({ root: handMade, args: ['add', '--', LANDING_LOT_FILE] })
			writeFiles({ root: handMade, files: { [LANDING_LOT_FILE]: LANDING_LOT_TEXT } })
		},
		fate: heldNowhere,
	},
	{
		title:
			'the lot’s file with the same bytes and the executable bit set → kept, held nowhere, the path named',
		arrange: ({ handMade }) => chmodSync(join(handMade, LANDING_LOT_FILE), 0o755),
		fate: heldNowhere,
	},
	{
		title: 'with a commit of its own the lot’s branch never took → not the lot’s, untouched',
		arrange: ({ handMade }) =>
			void commitIn({
				root: handMade,
				files: { 'src/red.ts': 'export const red = 1\n' },
				message: 'test: red',
			}),
		fate: () => ({ item: undefined, there: true }),
	},
]

describe(
	'lot prune --yes: a hand-made throwaway of a landed lot',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		for (const row of HAND_MADE)
			it(`a worktree cut by hand at the lot’s tip, ${row.title}`, () => {
				const { lot, handMade } = landedLotWithRedCheck()
				row.arrange({ lot, handMade })

				expect(
					handMadeFateOf({
						result: runLotPrune(lotPruneArgumentsOf({ lot, argv: [lot.name, '--yes'] })),
						lot,
						handMade,
					}),
				).toEqual(row.fate(lot))
			})

		it('its branch created from main (`git branch <b> main`) while main was at the lot’s tip, main moved since → its creation commit read from the reflog, it goes with its lot', () => {
			const lot = landingLotOf()
			mergeOnOrigin({ repository: lot.repository, how: 'fast-forward' })
			writeLandedFact({ lot, tip: lot.tip })
			const main = lot.workspace.repository
			git({ root: main, args: ['merge', '-q', '--ff-only', 'origin/main'] })
			git({ root: main, args: ['branch', RED_CHECK, 'main'] })
			commitIn({
				root: main,
				files: { 'src/main-moves.ts': 'export const main = 1\n' },
				message: 'feat: main moves on',
			})
			const path = join(lot.workspace.workspace, '.worktrees', '0009-repo-red-check')
			git({ root: main, args: ['worktree', 'add', '-q', path, RED_CHECK] })
			const handMade = realpathSync(path)

			expect(
				handMadeFateOf({
					result: runLotPrune(lotPruneArgumentsOf({ lot, argv: [lot.name, '--yes'] })),
					lot,
					handMade,
				}),
			).toEqual({ item: { decision: { go: true }, outcome: { removed: TRASHED } }, there: false })
		})
	},
)

const NOT_THE_LOTS: {
	title: string
	from: (lot: LandingLot) => string
	arrange: (params: { lot: LandingLot; handMade: string }) => void
}[] = [
	{
		title: 'cut at the lot’s cut (main before the lot), clean, no commit of its own',
		from: (lot) => lot.repository.cut,
		arrange: () => undefined,
	},
	{
		title: 'cut at the lot’s tip with a commit of its own that main holds',
		from: (lot) => lot.tip,
		arrange: ({ lot, handMade }) => {
			commitIn({
				root: handMade,
				files: { 'src/red.ts': 'export const red = 1\n' },
				message: 'test: red',
			})
			git({ root: handMade, args: ['push', '-q', 'origin', `${RED_CHECK}:main`] })
			git({ root: lot.workspace.repository, args: ['fetch', '-q', 'origin'] })
		},
	},
]

describe(
	'lot prune --yes: a worktree cut by hand that is not the lot’s',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		for (const row of NOT_THE_LOTS)
			it(`a worktree ${row.title} → not the lot’s, untouched`, () => {
				const lot = landedLot()
				const handMade = addRedCheck({ lot, from: row.from(lot) })
				row.arrange({ lot, handMade })

				expect(
					handMadeFateOf({
						result: runLotPrune(lotPruneArgumentsOf({ lot, argv: [lot.name, '--yes'] })),
						lot,
						handMade,
					}),
				).toEqual({ item: undefined, there: true })
			})
	},
)

const HANDOVER_STATES = ['pending', 'committed', 'abandoned'] as const

describe(
	'lot prune --yes: a worktree a hand-over names is never a hand-made throwaway',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		for (const state of HANDOVER_STATES)
			it(`a hand-over ${state} on a clean worktree cut by hand at a landed lot’s tip → not the lot’s, untouched`, () => {
				const { lot, handMade } = landedLotWithRedCheck()
				const folder = realpathSync(temporaryFolder('dialecte-handover-'))
				registerHandover({ root: handMade, folder, branch: RED_CHECK, now: LANDING_NOW })
				recordHandoverState({ store: handoverStoreOf(lot.workspace.repository), folder, state })

				expect(
					handMadeFateOf({
						result: runLotPrune(lotPruneArgumentsOf({ lot, argv: [lot.name, '--yes'] })),
						lot,
						handMade,
					}),
				).toEqual({ item: undefined, there: true })
			})
	},
)
