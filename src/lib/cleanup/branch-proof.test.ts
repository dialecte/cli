/**
 * A lot's branch under `lot prune --yes`, real git (DESIGN 3.5, 3.11 items 3-4, tests 22, 44, 45, 56, 57, 58): kept
 * while deleting it would lose a commit (its tip a candidate, an expired reflog hiding nothing), while an open lot
 * stacks on its name, while a worktree has it checked out; deleted only at the tip proved (`update-ref -d`), the tip,
 * the worktree list and the stacks read again right before; a waiting throwaway branch matched by its name and its tip.
 */
import { realpathSync } from 'node:fs'
import { join } from 'node:path'

import { writeStoreLot } from '../../../test/brief-workspace.ts'
import {
	addLandingLot,
	cancelLot,
	landingLotOf,
	lotBranchTipOf,
	registerLotEntry,
	removeLotWorktree,
	writeLandedFact,
} from '../../../test/landing-lot.ts'
import { mergeOnOrigin, strayCommitOf } from '../../../test/landing-repository.ts'
import {
	lotPruneArgumentsOf,
	prunedItemsOf,
	recordedRoundOf,
	runRecordedRemovals,
	writeWaitingThrowaway,
} from '../../../test/lot-prune-workspace.ts'
import { git, temporaryFolder } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { createRecordingSpawner } from '../../../test/worktree-pool.ts'
import { runLotPrune } from '../../commands/lot-prune.ts'
import { STACK_SCHEMA } from '../store/stack.constants.ts'
import { writeStack } from '../store/stack.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LandingLot } from '../../../test/landing-lot.types.ts'
import type { CommandResult } from '../command-result.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The child lot a `lot start --on` makes between the plan and the delete. */
const CHILD = '0003-repo-child'

/** The round's change of the lot's file. */
const ROUND_CHANGE = { 'src/x.ts': 'export const x = 11\n' }

/** A landed lot (fast-forward on origin, its landed fact) whose worktree an earlier close removed: only its branch left. */
function landedBranchOnly(): LandingLot {
	const lot = landingLotOf()
	mergeOnOrigin({ repository: lot.repository, how: 'fast-forward' })
	writeLandedFact({ lot, tip: lot.tip })
	removeLotWorktree(lot)
	return lot
}

/** A working store lot `name` of the lot's workspace started on `parent` (its `stack.json`), no worktree made yet. */
function startChildOn(params: { lot: LandingLot; parent: string; name: string }): void {
	const lotFolder = writeStoreLot({
		workspace: params.lot.workspace,
		name: params.name,
		scope: ['src/child.ts'],
		branch: 'feat/child',
		repository: params.lot.workspace.repository,
	})
	writeStack({ lotFolder, record: { schema: STACK_SCHEMA, parent: params.parent } })
}

/** The branch item of `branch` in the lot's part of a `lot prune --json` run, and the branch's tip after the run. */
function branchFateOf(params: { result: CommandResult; lot: LandingLot; branch: string }) {
	return {
		item: prunedItemsOf({ result: params.result, lot: params.lot.name })[`branch ${params.branch}`],
		tip: git({
			root: params.lot.workspace.repository,
			args: ['for-each-ref', '--format=%(objectname)', `refs/heads/${params.branch}`],
		}).trim(),
	}
}

/** The repository's config lines of `branch`'s section (`branch.<branch>.*`). */
function branchConfigOf(params: { lot: LandingLot; branch: string }): string[] {
	return git({ root: params.lot.workspace.repository, args: ['config', '--list'] })
		.split('\n')
		.filter((line) => line.startsWith(`branch.${params.branch}.`))
}

describe(
	'lot prune --yes: the branch delete, read again at the move',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('the branch tip moved between the proof and the delete → git refuses, the branch kept with git’s message at its new tip, exit 1', () => {
			const lot = landedBranchOnly()
			const moved = strayCommitOf({ root: lot.workspace.repository, parent: lot.tip })

			expect(
				((result: CommandResult) => ({
					exitCode: result.exitCode,
					...branchFateOf({ result, lot, branch: lot.branch }),
				}))(
					runLotPrune(
						lotPruneArgumentsOf({
							lot,
							argv: [lot.name, '--yes'],
							onPlanned: function moveTip() {
								git({
									root: lot.workspace.repository,
									args: ['update-ref', `refs/heads/${lot.branch}`, moved],
								})
							},
						}),
					),
				),
			).toEqual({
				exitCode: 1,
				item: {
					decision: { go: true },
					outcome: { kept: expect.stringContaining(`refs/heads/${lot.branch}`) },
				},
				tip: moved,
			})
		})

		it('a worktree checking the branch out made between the plan and the delete → kept, that worktree named and untouched', () => {
			const lot = landedBranchOnly()
			const other = join(realpathSync(temporaryFolder('dialecte-other-worktree-')), 'other')

			expect(
				((result: CommandResult) => ({
					...branchFateOf({ result, lot, branch: lot.branch }),
					head: git({ root: other, args: ['symbolic-ref', '--short', 'HEAD'] }).trim(),
				}))(
					runLotPrune(
						lotPruneArgumentsOf({
							lot,
							argv: [lot.name, '--yes'],
							onPlanned: function checkOut() {
								git({
									root: lot.workspace.repository,
									args: ['worktree', 'add', '-q', other, lot.branch],
								})
							},
						}),
					),
				),
			).toEqual({
				item: { decision: { go: true }, outcome: { kept: `checked out in ${other}` } },
				tip: lot.tip,
				head: lot.branch,
			})
		})

		it('a lot started on the lot between the plan and the delete → kept as the stack parent of the new lot', () => {
			const lot = landedBranchOnly()

			expect(
				branchFateOf({
					result: runLotPrune(
						lotPruneArgumentsOf({
							lot,
							argv: [lot.name, '--yes'],
							onPlanned: function startChild() {
								startChildOn({ lot, parent: lot.name, name: CHILD })
							},
						}),
					),
					lot,
					branch: lot.branch,
				}),
			).toEqual({
				item: {
					decision: { go: true },
					outcome: { kept: `the stack parent of ${CHILD} (working)` },
				},
				tip: lot.tip,
			})
		})

		it('a landed branch with an upstream set → deleted, its branch config section gone with it', () => {
			const lot = landedBranchOnly()
			git({
				root: lot.workspace.repository,
				args: ['config', `branch.${lot.branch}.remote`, 'origin'],
			})
			git({
				root: lot.workspace.repository,
				args: ['config', `branch.${lot.branch}.merge`, `refs/heads/${lot.branch}`],
			})

			expect(
				((result: CommandResult) => ({
					...branchFateOf({ result, lot, branch: lot.branch }),
					config: branchConfigOf({ lot, branch: lot.branch }),
				}))(runLotPrune(lotPruneArgumentsOf({ lot, argv: [lot.name, '--yes'] }))),
			).toEqual({
				item: { decision: { go: true }, outcome: { removed: 'deleted' } },
				tip: '',
				config: [],
			})
		})
	},
)

const CANCELED_LOSING: { title: string; arrange: (lot: LandingLot) => string }[] = [
	{
		title: 'its tip its own commit, every reflog expired',
		arrange: (lot) => {
			git({
				root: lot.workspace.repository,
				args: ['reflog', 'expire', '--expire=now', '--expire-unreachable=now', '--all'],
			})
			return lot.tip
		},
	},
	{
		title: 'a commit then a reset back to its cut, no expiry',
		arrange: (lot) => {
			git({ root: lot.worktree, args: ['reset', '-q', '--hard', lot.repository.cut] })
			return lot.tip
		},
	},
]

describe(
	'lot prune --yes: a canceled lot’s branch that holds the only copy of a commit',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		for (const row of CANCELED_LOSING)
			it(`a canceled lot, ${row.title}, its worktree closed first → the branch kept, the commit named`, () => {
				const lot = landingLotOf()
				const lost = row.arrange(lot)
				cancelLot(lot)
				removeLotWorktree(lot)
				const tip = lotBranchTipOf(lot)

				expect(
					branchFateOf({
						result: runLotPrune(lotPruneArgumentsOf({ lot, argv: [lot.name, '--yes'] })),
						lot,
						branch: lot.branch,
					}),
				).toEqual({
					item: {
						decision: { kept: expect.stringContaining(lost.slice(0, 12)) },
						outcome: { kept: expect.stringContaining(lost.slice(0, 12)) },
					},
					tip,
				})
			})
	},
)

describe(
	'lot prune --yes: a branch name matched by more than its name',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('a waiting throwaway branch named in a removing line, deleted then recreated at another tip → not matched: recreated since, untouched', () => {
			const lot = landingLotOf()
			const round = recordedRoundOf({ lot, round: 1, changed: ROUND_CHANGE })
			mergeOnOrigin({ repository: lot.repository, how: 'fast-forward' })
			writeLandedFact({ lot, tip: lotBranchTipOf(lot) ?? lot.tip })
			writeWaitingThrowaway({ lot, round })
			git({ root: lot.workspace.repository, args: ['branch', '-D', round.branch] })
			git({ root: lot.workspace.repository, args: ['branch', round.branch, lot.repository.cut] })

			expect(
				branchFateOf({
					result: runLotPrune(lotPruneArgumentsOf({ lot, argv: [lot.name, '--yes'] })),
					lot,
					branch: round.branch,
				}),
			).toEqual({
				item: {
					decision: { kept: 'not matched: recreated since' },
					outcome: { kept: 'not matched: recreated since' },
				},
				tip: lot.repository.cut,
			})
		})

		it('a canceled lot whose branch name a committed lot reuses, a child stacked on that lot → lot prune of the canceled lot keeps the branch as the child’s stack parent', () => {
			const first = landingLotOf()
			cancelLot(first)
			removeLotWorktree(first)
			git({ root: first.workspace.repository, args: ['branch', '-D', first.branch] })
			const second = addLandingLot({ lot: first, name: '0002-repo-x', branch: first.branch })
			registerLotEntry({ lot: second })
			startChildOn({ lot: first, parent: second.name, name: CHILD })

			expect(
				branchFateOf({
					result: runLotPrune(lotPruneArgumentsOf({ lot: first, argv: [first.name, '--yes'] })),
					lot: first,
					branch: first.branch,
				}),
			).toEqual({
				item: {
					decision: { kept: `the stack parent of ${CHILD} (working)` },
					outcome: { kept: `the stack parent of ${CHILD} (working)` },
				},
				tip: second.tip,
			})
		})

		it('a waiting throwaway branch that gained a commit since its removing line → matched, kept naming the commit it would lose', () => {
			const lot = landingLotOf()
			const round = recordedRoundOf({ lot, round: 1, changed: ROUND_CHANGE })
			mergeOnOrigin({ repository: lot.repository, how: 'fast-forward' })
			writeLandedFact({ lot, tip: lotBranchTipOf(lot) ?? lot.tip })
			writeWaitingThrowaway({ lot, round })
			const gained = strayCommitOf({ root: lot.workspace.repository, parent: round.tip })
			git({
				root: lot.workspace.repository,
				args: ['update-ref', `refs/heads/${round.branch}`, gained],
			})

			expect(
				branchFateOf({
					result: runLotPrune(lotPruneArgumentsOf({ lot, argv: [lot.name, '--yes'] })),
					lot,
					branch: round.branch,
				}),
			).toEqual({
				item: {
					decision: { kept: expect.stringContaining(gained.slice(0, 12)) },
					outcome: { kept: expect.stringContaining(gained.slice(0, 12)) },
				},
				tip: gained,
			})
		})
	},
)

describe(
	'lot prune --yes: the run’s branches proved together',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('a canceled lot’s branch and its throwaway’s branch both holding a commit no other ref holds → on the next run at least one kept naming it, the commit still reachable', () => {
			const lot = landingLotOf()
			const round = recordedRoundOf({ lot, round: 1, changed: ROUND_CHANGE })
			const shared = lotBranchTipOf(lot) ?? lot.tip
			git({ root: round.path, args: ['reset', '-q', '--hard', shared] })
			cancelLot(lot)
			const { spawner, calls } = createRecordingSpawner()
			runLotPrune(lotPruneArgumentsOf({ lot, argv: [lot.name, '--yes'], spawner }))
			runRecordedRemovals(calls)

			expect(
				((result: CommandResult) => ({
					namingIt: [lot.branch, round.branch].some((branch) =>
						JSON.stringify(
							prunedItemsOf({ result, lot: lot.name })[`branch ${branch}`]?.outcome ?? {},
						).includes(shared.slice(0, 12)),
					),
					reachable:
						git({
							root: lot.workspace.repository,
							args: ['for-each-ref', '--contains', shared, '--format=%(refname)', 'refs/heads/'],
						}).trim() !== '',
				}))(runLotPrune(lotPruneArgumentsOf({ lot, argv: [lot.name, '--yes'] }))),
			).toEqual({ namingIt: true, reachable: true })
		})
	},
)
