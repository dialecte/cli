/**
 * A stale store lot (DESIGN 3.10, the 0022 shape): it landed through a hand-over outside the store, its branch and
 * worktree are gone, so git has no tip to read. Its landing is read from the latest `card` line of that hand-over (on
 * its branch, its registry entry naming the lot's worktree) when, and only when, its branch ref and its worktree are
 * both gone and the card was written at or after the lot's creation.
 */
import { existsSync } from 'node:fs'

import {
	addLandingLot,
	cardsLogOf,
	closeArgumentsOf,
	closeOutcomesOf,
	landingLotOf,
	registerCommittedHandover,
} from '../../test/landing-lot.ts'
import {
	commitDetached,
	landingHostOf,
	mergeOnOrigin,
	strayCommitOf,
} from '../../test/landing-repository.ts'
import { git } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { writeCard } from '../lib/events/cards-log.ts'
import { handoverStoreOf, recordHandoverClosed } from '../lib/handover/handover-store.ts'
import { readLanded } from '../lib/landing/landed-record.ts'
import { readIdentity } from '../lib/store/identity.ts'
import { readCheckedLotState, registryOfLotFolder } from '../lib/store/lot-records.ts'
import { lotState } from '../lib/store/lot-state.ts'
import { runLotClose } from './lot-close.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LandingLot } from '../../test/landing-lot.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** A commit id no repository of the cases holds. */
const GONE_COMMIT = '0123456789abcdef0123456789abcdef01234567'

/** One day in milliseconds: a card written a day before the lot was created. */
const DAY_MS = 24 * 60 * 60 * 1000

/** A store lot of the 0022 shape before its branch and worktree go: its hand-over's name. */
function staleLotOf(lot: LandingLot): string {
	const handover = registerCommittedHandover(lot)
	recordHandoverClosed({
		store: handoverStoreOf(lot.workspace.repository),
		name: handover,
		at: new Date(),
	})
	return handover
}

/** A `card` line of the hand-over (no store lot: `lot: null`) on the lot's branch at `head`, `offset` ms after the lot's creation. */
function writeHandoverCard(params: {
	lot: LandingLot
	handover: string
	head: string
	offset: number
	/** The card's `lot`: the lot's own name for a store lot's card; `null` (a hand-over outside the store) when left out. */
	ownLot?: string
}): void {
	const { lot } = params
	const created = Date.parse(readIdentity({ lotFolder: lot.lotFolder })?.created ?? '')
	writeCard({
		file: cardsLogOf(lot),
		line: {
			at: new Date(created + params.offset).toISOString(),
			lot: params.ownLot ?? null,
			name: params.handover,
			state: 'committed',
			feature: null,
			repository: lot.workspace.repository,
			branch: lot.branch,
			head: params.head,
			base: 'main',
			card: null,
			usage: null,
			records: null,
			by: 'handover-run',
		},
	})
}

/** The lot's worktree removed and its branch deleted, as an old hand-over's clean-up left them. */
function removeBranchAndWorktree(lot: LandingLot): void {
	git({ root: lot.workspace.repository, args: ['worktree', 'remove', '--force', lot.worktree] })
	git({ root: lot.workspace.repository, args: ['branch', '-D', lot.branch] })
}

/** `lot close <handover> --json` from the main checkout, a host that knows no pull request. */
function closeHandover(params: { lot: LandingLot; handover: string }) {
	return runLotClose(
		closeArgumentsOf({
			lot: params.lot,
			names: [params.handover],
			host: landingHostOf({}).host,
		}),
	)
}

/** The lot's state as its records read it now. */
function stateOf(lot: LandingLot): string | undefined {
	const checked = readCheckedLotState({
		lotFolder: lot.lotFolder,
		registry: registryOfLotFolder(lot.lotFolder),
	})
	return checked === undefined || 'damage' in checked ? undefined : lotState(checked.input).state
}

describe(
	'a stale store lot: its landing read from its hand-over’s card',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('branch and worktree gone, a closed hand-over card on its branch whose head is in the base → already closed with the landed line, landed.json written, the lot reads committed', () => {
			const lot = landingLotOf()
			const handover = staleLotOf(lot)
			writeHandoverCard({ lot, handover, head: lot.tip, offset: 1000 })
			mergeOnOrigin({ repository: lot.repository, how: 'fast-forward' })
			removeBranchAndWorktree(lot)

			const result = closeHandover({ lot, handover })

			expect({
				outcomes: closeOutcomesOf(result),
				landed: readLanded({ lotFolder: lot.lotFolder }),
				state: stateOf(lot),
			}).toEqual({
				outcomes: [
					{ closed: true, already: true, landed: expect.stringContaining('landed on main') },
				],
				landed: expect.objectContaining({ how: 'ancestor', tip: lot.tip }),
				state: 'committed',
			})
		})

		it('the same with the card’s head not in the base → nothing written, the lot still working', () => {
			const lot = landingLotOf()
			const handover = staleLotOf(lot)
			writeHandoverCard({ lot, handover, head: lot.tip, offset: 1000 })
			removeBranchAndWorktree(lot)

			const result = closeHandover({ lot, handover })

			expect({
				outcomes: closeOutcomesOf(result),
				landed: readLanded({ lotFolder: lot.lotFolder }),
				state: stateOf(lot),
			}).toEqual({
				outcomes: [{ closed: true, already: true }],
				landed: undefined,
				state: 'working',
			})
		})

		it('the same with no card line → nothing written, the lot still working', () => {
			const lot = landingLotOf()
			const handover = staleLotOf(lot)
			mergeOnOrigin({ repository: lot.repository, how: 'fast-forward' })
			removeBranchAndWorktree(lot)

			const result = closeHandover({ lot, handover })

			expect({
				outcomes: closeOutcomesOf(result),
				landed: readLanded({ lotFolder: lot.lotFolder }),
				state: stateOf(lot),
			}).toEqual({
				outcomes: [{ closed: true, already: true }],
				landed: undefined,
				state: 'working',
			})
		})

		it('two card lines for the branch, the first at a head the base never took → the latest wins: landed at the lot’s tip', () => {
			const lot = landingLotOf()
			const handover = staleLotOf(lot)
			const stray = strayCommitOf({ root: lot.workspace.repository, parent: lot.tip })
			writeHandoverCard({ lot, handover, head: stray, offset: 1000 })
			writeHandoverCard({ lot, handover, head: lot.tip, offset: 2000 })
			mergeOnOrigin({ repository: lot.repository, how: 'fast-forward' })
			removeBranchAndWorktree(lot)

			closeHandover({ lot, handover })

			expect(readLanded({ lotFolder: lot.lotFolder })).toEqual(
				expect.objectContaining({ how: 'ancestor', tip: lot.tip }),
			)
		})

		it('the branch renamed while its worktree stays → no recorded tip read, nothing written', () => {
			const lot = landingLotOf()
			const handover = staleLotOf(lot)
			writeHandoverCard({ lot, handover, head: lot.tip, offset: 1000 })
			mergeOnOrigin({ repository: lot.repository, how: 'fast-forward' })
			git({ root: lot.worktree, args: ['branch', '-m', lot.branch, 'feat/renamed'] })

			closeHandover({ lot, handover })

			expect({
				landed: readLanded({ lotFolder: lot.lotFolder }),
				worktree: existsSync(lot.worktree),
			}).toEqual({
				landed: undefined,
				worktree: true,
			})
		})

		it('a card line written before the lot was created, for the same branch → not used, nothing written', () => {
			const lot = landingLotOf()
			const handover = staleLotOf(lot)
			writeHandoverCard({ lot, handover, head: lot.tip, offset: -DAY_MS })
			mergeOnOrigin({ repository: lot.repository, how: 'fast-forward' })
			removeBranchAndWorktree(lot)

			closeHandover({ lot, handover })

			expect(readLanded({ lotFolder: lot.lotFolder })).toBeUndefined()
		})

		it('two card lines for the branch, the latest at a head the base never took → the latest wins: nothing written', () => {
			const lot = landingLotOf()
			const handover = staleLotOf(lot)
			// a later commit of its own the base never takes (its work is in no tree of main)
			const stray = commitDetached({
				worktree: lot.worktree,
				files: { 'src/stray.ts': 'export const stray = 1\n' },
				reattach: true,
			})
			writeHandoverCard({ lot, handover, head: lot.tip, offset: 1000 })
			writeHandoverCard({ lot, handover, head: stray, offset: 2000 })
			mergeOnOrigin({ repository: lot.repository, how: 'fast-forward' })
			removeBranchAndWorktree(lot)

			closeHandover({ lot, handover })

			expect(readLanded({ lotFolder: lot.lotFolder })).toBeUndefined()
		})

		it('a card line of the lot itself (its own name as lot), its head in the base → landed at that head', () => {
			const lot = landingLotOf()
			const handover = staleLotOf(lot)
			writeHandoverCard({ lot, handover: lot.name, head: lot.tip, offset: 1000, ownLot: lot.name })
			mergeOnOrigin({ repository: lot.repository, how: 'fast-forward' })
			removeBranchAndWorktree(lot)

			closeHandover({ lot, handover })

			expect(readLanded({ lotFolder: lot.lotFolder })).toEqual(
				expect.objectContaining({ how: 'ancestor', tip: lot.tip }),
			)
		})

		it('a card line on the lot’s branch from a hand-over whose entry names another worktree → not used, nothing written', () => {
			const lot = landingLotOf()
			const handover = staleLotOf(lot)
			const other = addLandingLot({ lot, name: '0002-repo-y', branch: 'feat/y' })
			const otherHandover = registerCommittedHandover(other)
			writeHandoverCard({ lot, handover: otherHandover, head: lot.tip, offset: 1000 })
			mergeOnOrigin({ repository: lot.repository, how: 'fast-forward' })
			removeBranchAndWorktree(lot)

			closeHandover({ lot, handover })

			expect(readLanded({ lotFolder: lot.lotFolder })).toBeUndefined()
		})

		it('a card line whose head names an object the repository does not hold → unknown, nothing written', () => {
			const lot = landingLotOf()
			const handover = staleLotOf(lot)
			writeHandoverCard({ lot, handover, head: GONE_COMMIT, offset: 1000 })
			mergeOnOrigin({ repository: lot.repository, how: 'fast-forward' })
			removeBranchAndWorktree(lot)

			closeHandover({ lot, handover })

			expect(readLanded({ lotFolder: lot.lotFolder })).toBeUndefined()
		})
	},
)
