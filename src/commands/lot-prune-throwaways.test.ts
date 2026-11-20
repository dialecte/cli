/**
 * `lot prune --yes` over a lot's review throwaways and its worktree, real git (DESIGN 3.2 acts 2-4, 3.4, tests 20, 27,
 * 28, 30, 36, 43): each item proved again at the move, a throwaway proved once more in the trash, a branch waiting on
 * a worktree moved in the run deleted by the next run at the tip it proved, a removal's `removing` line by `lot-prune`.
 */
import { chmodSync, existsSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { LANDING_LOT_FILE, MAIN_EDIT_TEXT } from '../../test/landing-lot.constants.ts'
import {
	addRoundOf,
	landingLotOf,
	lotBranchTipOf,
	writeLandedFact,
} from '../../test/landing-lot.ts'
import {
	editOnOrigin,
	headOf,
	mergeOnOrigin,
	rebaseOnto,
	rebaseResolving,
} from '../../test/landing-repository.ts'
import {
	runRecordedRemovals,
	lotPruneArgumentsOf,
	prunedItemsOf,
	pruneRunOf,
	recordedRoundOf,
	removalsOf,
	trashPathAt,
	writeKilledRemoving,
} from '../../test/lot-prune-workspace.ts'
import { git } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { createRecordingSpawner } from '../../test/worktree-pool.ts'
import { shellQuote } from '../lib/shell-quote.ts'
import { runLotPrune } from './lot-prune.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LandingLot } from '../../test/landing-lot.types.ts'
import type { RecordedRound } from '../../test/lot-prune-workspace.types.ts'
import type { CommandResult } from '../lib/command-result.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The round's change: a fix of the lot's file, the same in the snapshot, the throwaway and the lot's next commit. */
const ROUND_CHANGE = { [LANDING_LOT_FILE]: 'export const x = 11\n' }

/** A file main gains while the lot waits: no conflict with the lot's. */
const MAIN_FILE = { 'src/main-moves.ts': 'export const main = 1\n' }

/** The text the person writes over a conflict of the lot's file with main's. */
const RESOLVED = { [LANDING_LOT_FILE]: 'export const x = 3\n' }

/** A branch's outcome while the worktree that has it checked out waits in the trash. */
const WAITING = expect.stringMatching(/^waiting for the trash: .*\/\.worktrees\/_trash\//)

/** A trash path, whatever its time stamp. */
const TRASHED = expect.stringMatching(/\/\.worktrees\/_trash\//)

/** A store lot with a recorded round throwaway, landed on main by a fast-forward, its landed fact written. */
function landedLotWithRound(): { lot: LandingLot; round: RecordedRound } {
	const lot = landingLotOf()
	const round = recordedRoundOf({ lot, round: 1, changed: ROUND_CHANGE })
	mergeOnOrigin({ repository: lot.repository, how: 'fast-forward' })
	writeLandedFact({ lot, tip: headOf(lot.worktree) })
	return { lot, round }
}

/**
 * The 0192 shape: a lot with a recorded round, rebased onto a main that moved on another file (every replaced head
 * has its change-id twin), squash-merged, its landed fact at the rebased tip.
 */
function squashedWithTwins(): { lot: LandingLot; round: RecordedRound } {
	const lot = landingLotOf()
	const round = recordedRoundOf({ lot, round: 1, changed: ROUND_CHANGE })
	editOnOrigin({ repository: lot.repository, files: MAIN_FILE })
	const rebased = rebaseOnto({ worktree: lot.worktree, onto: 'origin/main' })
	mergeOnOrigin({ repository: lot.repository, how: 'squash' })
	writeLandedFact({ lot, tip: rebased })
	return { lot, round }
}

describe(
	'lot prune --yes: a squash-landed lot and the next run',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('the 0192 shape → worktree and throwaway moved to the trash, both branches waiting for the trash; the plan had them after their worktrees', () => {
			const { lot, round } = squashedWithTwins()

			expect(
				prunedItemsOf({
					result: runLotPrune(lotPruneArgumentsOf({ lot, argv: [lot.name, '--yes'] })),
					lot: lot.name,
				}),
			).toEqual({
				[`worktree ${lot.worktree}`]: { decision: { go: true }, outcome: { removed: TRASHED } },
				[`throwaway ${round.path}`]: { decision: { go: true }, outcome: { removed: TRASHED } },
				[`branch ${lot.branch}`]: {
					decision: { after: lot.worktree },
					outcome: { waiting: WAITING },
				},
				[`branch ${round.branch}`]: {
					decision: { after: round.path },
					outcome: { waiting: WAITING },
				},
			})
		})

		it('the 0192 shape, the next run once git’s background removals finished → both branches deleted, each removing line holding the tip proved', () => {
			const { lot, round } = squashedWithTwins()
			const lotTip = lotBranchTipOf(lot)
			const { spawner, calls } = createRecordingSpawner()

			expect(
				pruneRunOf(runLotPrune(lotPruneArgumentsOf({ lot, argv: [lot.name, '--yes'], spawner })))
					.exitCode,
			).toBe(0)
			runRecordedRemovals(calls)
			expect(
				((result: CommandResult) => ({
					items: prunedItemsOf({ result, lot: lot.name }),
					branchRemovals: removalsOf(lot)
						.filter((removal) => removal.item === 'branch')
						.map((removal) => ({ branch: removal.branch, tip: removal.tip, by: removal.by }))
						.sort((first, second) => (first.branch ?? '').localeCompare(second.branch ?? '')),
					left: [lotBranchTipOf(lot), lotBranchTipOf({ ...lot, branch: round.branch })],
				}))(runLotPrune(lotPruneArgumentsOf({ lot, argv: [lot.name, '--yes'] }))),
			).toEqual({
				items: expect.objectContaining({
					[`branch ${lot.branch}`]: { decision: { go: true }, outcome: { removed: 'deleted' } },
					[`branch ${round.branch}`]: { decision: { go: true }, outcome: { removed: 'deleted' } },
				}),
				branchRemovals: [
					{ branch: lot.branch, tip: lotTip, by: 'lot-prune' },
					{ branch: round.branch, tip: round.tip, by: 'lot-prune' },
				].sort((first, second) => first.branch.localeCompare(second.branch)),
				left: [undefined, undefined],
			})
		})

		it('the 0191 shape (a rebase conflict resolved by hand: no twin) → the worktree goes, the branch kept naming the commit without a twin', () => {
			const lot = landingLotOf()
			editOnOrigin({ repository: lot.repository, files: { [LANDING_LOT_FILE]: MAIN_EDIT_TEXT } })
			const resolved = rebaseResolving({
				worktree: lot.worktree,
				onto: 'origin/main',
				files: RESOLVED,
			})
			mergeOnOrigin({ repository: lot.repository, how: 'squash' })
			writeLandedFact({ lot, tip: resolved })

			expect(
				prunedItemsOf({
					result: runLotPrune(lotPruneArgumentsOf({ lot, argv: [lot.name, '--yes'] })),
					lot: lot.name,
				}),
			).toEqual({
				[`worktree ${lot.worktree}`]: { decision: { go: true }, outcome: { removed: TRASHED } },
				[`branch ${lot.branch}`]: {
					decision: { kept: expect.stringContaining(lot.tip.slice(0, 12)) },
					outcome: { kept: expect.stringContaining(lot.tip.slice(0, 12)) },
				},
			})
		})
	},
)

describe('lot prune --yes: a throwaway proved at the move', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a file written into the throwaway after the plan, before its move → kept, its folder where it was', () => {
		const { lot, round } = landedLotWithRound()

		expect(
			((result: CommandResult) => ({
				item: prunedItemsOf({ result, lot: lot.name })[`throwaway ${round.path}`],
				there: existsSync(join(round.path, 'late.txt')),
			}))(
				runLotPrune(
					lotPruneArgumentsOf({
						lot,
						argv: [lot.name, '--yes'],
						onPlanned: function writeLate() {
							writeFileSync(join(round.path, 'late.txt'), 'a late note\n')
						},
					}),
				),
			),
		).toEqual({
			item: { decision: { go: true }, outcome: { kept: expect.stringContaining('late.txt') } },
			there: true,
		})
	})

	it('a file written into the throwaway after its move, before its second proof → left in the trash, still registered, no removal started for it, kept naming the file', () => {
		const { lot, round } = landedLotWithRound()
		const moved: string[] = []
		const { spawner, calls } = createRecordingSpawner()

		expect(
			((result: CommandResult) => ({
				item: prunedItemsOf({ result, lot: lot.name })[`throwaway ${round.path}`],
				left: moved.map((trashed) => existsSync(join(trashed, 'late.txt'))),
				registered: moved.map((trashed) =>
					git({
						root: lot.workspace.repository,
						args: ['worktree', 'list', '--porcelain'],
					}).includes(`worktree ${trashed}\n`),
				),
				removals: calls.filter((call) =>
					moved.some((trashed) => JSON.stringify(call).includes(trashed)),
				),
			}))(
				runLotPrune(
					lotPruneArgumentsOf({
						lot,
						argv: [lot.name, '--yes'],
						spawner,
						afterThrowawayMove: function writeLate(trashed) {
							moved.push(trashed)
							writeFileSync(join(trashed, 'late.txt'), 'a late note\n')
						},
					}),
				),
			),
		).toEqual({
			item: { decision: { go: true }, outcome: { kept: expect.stringContaining('late.txt') } },
			left: [true],
			registered: [true],
			removals: [],
		})
	})

	it('two lot prune --yes at once on one lot → each item moved once, the second run’s outcome kept: gone', () => {
		const { lot, round } = landedLotWithRound()
		const second: CommandResult[] = []

		expect(
			((first: CommandResult) => ({
				first: prunedItemsOf({ result: first, lot: lot.name }),
				second: second.map((result) => prunedItemsOf({ result, lot: lot.name })),
				moves: removalsOf(lot)
					.filter((removal) => removal.item !== 'branch')
					.map((removal) => removal.path)
					.sort(),
			}))(
				runLotPrune(
					lotPruneArgumentsOf({
						lot,
						argv: [lot.name, '--yes'],
						onPlanned: function pruneMeanwhile() {
							second.push(runLotPrune(lotPruneArgumentsOf({ lot, argv: [lot.name, '--yes'] })))
						},
					}),
				),
			),
		).toEqual({
			first: expect.objectContaining({
				[`worktree ${lot.worktree}`]: {
					decision: { go: true },
					outcome: { kept: expect.stringContaining('gone') },
				},
				[`throwaway ${round.path}`]: {
					decision: { go: true },
					outcome: { kept: expect.stringContaining('gone') },
				},
			}),
			second: [
				expect.objectContaining({
					[`worktree ${lot.worktree}`]: { decision: { go: true }, outcome: { removed: TRASHED } },
					[`throwaway ${round.path}`]: { decision: { go: true }, outcome: { removed: TRASHED } },
				}),
			],
			moves: [lot.worktree, round.path].sort(),
		})
	})

	it('a run killed between a throwaway’s removing line and its move → the next run decides it again and moves it', () => {
		const { lot, round } = landedLotWithRound()
		writeKilledRemoving({ lot, round })

		expect(
			prunedItemsOf({
				result: runLotPrune(lotPruneArgumentsOf({ lot, argv: [lot.name, '--yes'] })),
				lot: lot.name,
			})[`throwaway ${round.path}`],
		).toEqual({ decision: { go: true }, outcome: { removed: TRASHED } })
	})
})

describe('lot prune: the trash and the records', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a lot worktree registered under the trash an hour after the time in its folder name, holding a file → listed refused with what git status shows and the person’s command', () => {
		const lot = landingLotOf()
		writeFileSync(join(lot.worktree, 'kept-by-git.txt'), 'git refused to delete me\n')
		const path = trashPathAt({ lot, name: lot.name, at: new Date('2026-11-17T21:00:00.000Z') })
		mkdirSync(dirname(path), { recursive: true })
		git({ root: lot.workspace.repository, args: ['worktree', 'move', lot.worktree, path] })
		const trashed = realpathSync(path)
		const main = realpathSync(lot.workspace.repository)

		expect(pruneRunOf(runLotPrune(lotPruneArgumentsOf({ lot, argv: [] }))).output.refused).toEqual([
			{
				worktree: trashed,
				status: expect.stringContaining('kept-by-git.txt'),
				command: `cd ${shellQuote(main)} && git worktree remove --force ${shellQuote(trashed)}`,
			},
		])
	})

	it('a removal made by lot prune → its removing lines say by lot-prune', () => {
		const { lot } = landedLotWithRound()

		expect(
			((result: CommandResult) => ({
				exitCode: result.exitCode,
				items: [...new Set(removalsOf(lot).map((removal) => removal.item))].sort(),
				by: [...new Set(removalsOf(lot).map((removal) => removal.by))],
			}))(runLotPrune(lotPruneArgumentsOf({ lot, argv: [lot.name, '--yes'] }))),
		).toEqual({ exitCode: 0, items: ['throwaway', 'worktree'], by: ['lot-prune'] })
	})
})

const NAMED_LIKE_A_THROWAWAY: { title: string; arrange: (lot: LandingLot) => string }[] = [
	{
		title: 'a worktree `<lot worktree>-round-2` on `<lot branch>-round-2` no step recorded',
		arrange: (lot) => addRoundOf({ lot, round: 2 }),
	},
	{
		title: 'a round throwaway whose throwaway-add step ended with exit 1',
		arrange: (lot) => recordedRoundOf({ lot, round: 1, changed: ROUND_CHANGE, exit: 1 }).path,
	},
]

describe(
	'lot prune --yes: a worktree is the lot’s throwaway only when a step recorded it',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		for (const row of NAMED_LIKE_A_THROWAWAY)
			it(`${row.title}, its lot landed → not the lot’s, its folder still there`, () => {
				const lot = landingLotOf()
				const path = row.arrange(lot)
				mergeOnOrigin({ repository: lot.repository, how: 'fast-forward' })
				writeLandedFact({ lot, tip: headOf(lot.worktree) })

				expect(
					((result: CommandResult) => ({
						item: prunedItemsOf({ result, lot: lot.name })[`throwaway ${path}`],
						there: existsSync(path),
					}))(runLotPrune(lotPruneArgumentsOf({ lot, argv: [lot.name, '--yes'] }))),
				).toEqual({ item: undefined, there: true })
			})
	},
)

describe('lot prune: a throwaway folder deleted by hand', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a recorded throwaway’s folder deleted by hand, still registered (a prunable entry) → read as gone, its branch decided by its commits: go', () => {
		const { lot, round } = landedLotWithRound()
		rmSync(round.path, { recursive: true, force: true })

		expect(
			prunedItemsOf({
				result: runLotPrune(lotPruneArgumentsOf({ lot, argv: [lot.name] })),
				lot: lot.name,
			})[`branch ${round.branch}`],
		).toEqual({ decision: { go: true } })
	})
})

/** Folders a case made unreadable: given their mode back after it, so the scratch folders can be removed. */
const UNREADABLE: string[] = []

afterEach(function restoreModes() {
	for (const folder of UNREADABLE.splice(0)) chmodSync(folder, 0o755)
})

describe('lot prune --yes: a keep check that fails', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('the lot’s worktree unreadable (its status cannot be read) → that worktree kept with the message, the run goes on: its throwaway moved to the trash', () => {
		const { lot, round } = landedLotWithRound()
		chmodSync(lot.worktree, 0o000)
		UNREADABLE.push(lot.worktree)

		expect(
			((result: CommandResult) => ({
				worktree: prunedItemsOf({ result, lot: lot.name })[`worktree ${lot.worktree}`],
				throwaway: prunedItemsOf({ result, lot: lot.name })[`throwaway ${round.path}`],
			}))(runLotPrune(lotPruneArgumentsOf({ lot, argv: [lot.name, '--yes'] }))),
		).toEqual({
			worktree: expect.objectContaining({ decision: { kept: expect.any(String) } }),
			throwaway: { decision: { go: true }, outcome: { removed: TRASHED } },
		})
	})
})
