/**
 * `lot prune` when a git read a removal decision rests on fails, real git behind a `git` on PATH that fails the one
 * read a case names: the stashes, a branch's commits or reflog, a hand-made throwaway's reflog or its lot's; the item
 * is kept with `could not read <what>: <git's error>`, never read as empty. And a branch whose commit another branch
 * held at the plan, that branch deleted before the delete: its loss read again, the branch kept naming the commit. And
 * a lot's worktree whose own records (its HEAD reflog, its own refs) cannot be read: kept with why.
 */
import { existsSync, realpathSync } from 'node:fs'
import { join } from 'node:path'

import { failGitReadsOf, unreadOf } from '../../test/failing-git.ts'
import {
	addLandingLot,
	cancelLot,
	landingLotOf,
	lotBranchTipOf,
	removeLotWorktree,
	writeLandedFact,
} from '../../test/landing-lot.ts'
import { mergeOnOrigin } from '../../test/landing-repository.ts'
import { lotPruneArgumentsOf, prunedItemsOf } from '../../test/lot-prune-workspace.ts'
import { git } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { SHORT_SHA_LENGTH } from '../lib/gate-records/gate-records.constants.ts'
import { runLotPrune } from './lot-prune.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LandingLot } from '../../test/landing-lot.types.ts'
import type { CommandResult } from '../lib/command-result.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The hand-made throwaway's branch, as a reviewer names a red check. */
const RED_CHECK = 'red-check'

/** The second terminal lot of the race, its branch cut from the first lot's branch. */
const SECOND_LOT = '0002-repo-y'
const SECOND_BRANCH = 'feat/y'

/** A store lot landed by a fast-forward on origin, its landed fact written. */
function landedLot(): LandingLot {
	const lot = landingLotOf()
	mergeOnOrigin({ repository: lot.repository, how: 'fast-forward' })
	writeLandedFact({ lot, tip: lot.tip })
	return lot
}

/** A landed lot whose worktree an earlier close removed: only its branch left. */
function landedBranchOnly(): LandingLot {
	const lot = landedLot()
	removeLotWorktree(lot)
	return lot
}

/** A worktree `.worktrees/0009-repo-red-check` cut by hand at the lot's tip on a new branch `red-check`: its real path. */
function addRedCheck(lot: LandingLot): string {
	const path = join(lot.workspace.workspace, '.worktrees', '0009-repo-red-check')
	git({
		root: lot.workspace.repository,
		args: ['worktree', 'add', '-q', '-b', RED_CHECK, path, lot.tip],
	})
	return realpathSync(path)
}

/** `lot prune <lot> --yes --json` with the `git` reads holding `pattern` failing. */
function pruneFailing(params: { lot: LandingLot; pattern: string }): CommandResult {
	failGitReadsOf({ pattern: params.pattern })
	return runLotPrune(lotPruneArgumentsOf({ lot: params.lot, argv: [params.lot.name, '--yes'] }))
}

/** The exit code, the lot's branch item, and its branch's tip after the run. */
function branchFateOf(params: { result: CommandResult; lot: LandingLot }) {
	return {
		exitCode: params.result.exitCode,
		item: prunedItemsOf({ result: params.result, lot: params.lot.name })[
			`branch ${params.lot.branch}`
		],
		tip: lotBranchTipOf(params.lot),
	}
}

/** The hand-made throwaway's item under the lot, and whether its folder is still there. */
function handMadeFateOf(params: { result: CommandResult; lot: LandingLot; handMade: string }) {
	return {
		item: prunedItemsOf({ result: params.result, lot: params.lot.name })[
			`throwaway ${params.handMade}`
		],
		there: existsSync(params.handMade),
	}
}

const BRANCH_READS: {
	title: string
	pattern: (lot: LandingLot) => string
	kept: (lot: LandingLot) => string
}[] = [
	{
		title: 'the stashes not read',
		pattern: () => 'stash list',
		kept: () => unreadOf({ what: 'the stashes', args: 'stash list --format=%gs' }),
	},
	{
		title: 'the commits of the lot’s branch not read',
		pattern: (lot) => `rev-list refs/heads/${lot.branch}`,
		kept: (lot) =>
			unreadOf({
				what: `the commits of ${lot.branch}`,
				args: `rev-list refs/heads/${lot.branch}`,
			}),
	},
	{
		title: 'the reflog of the lot’s branch not read',
		pattern: (lot) => `reflog show --format=%H refs/heads/${lot.branch}`,
		kept: (lot) =>
			unreadOf({
				what: `the reflog of ${lot.branch}`,
				args: `reflog show --format=%H refs/heads/${lot.branch} --`,
			}),
	},
]

describe(
	'lot prune --yes: a landed lot’s branch whose git read fails',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		for (const row of BRANCH_READS)
			it(`${row.title} → the branch kept with why, its tip untouched, exit 0`, () => {
				const lot = landedBranchOnly()

				expect(
					branchFateOf({
						result: pruneFailing({ lot, pattern: row.pattern(lot) }),
						lot,
					}),
				).toEqual({
					exitCode: 0,
					item: {
						decision: { kept: row.kept(lot) },
						outcome: { kept: row.kept(lot) },
					},
					tip: lot.tip,
				})
			})
	},
)

const HAND_MADE_READS: {
	title: string
	pattern: (lot: LandingLot) => string
	kept: (lot: LandingLot) => string
}[] = [
	{
		title: 'the reflog of its own branch not read',
		pattern: () => `reflog show --format=%H %gs refs/heads/${RED_CHECK}`,
		kept: () =>
			unreadOf({
				what: `the reflog of ${RED_CHECK}`,
				args: `reflog show --format=%H %gs refs/heads/${RED_CHECK} --`,
			}),
	},
	{
		title: 'the reflog of the lot’s branch not read',
		pattern: (lot) => `reflog show --format=%H refs/heads/${lot.branch}`,
		kept: (lot) =>
			unreadOf({
				what: `the reflog of ${lot.branch}`,
				args: `reflog show --format=%H refs/heads/${lot.branch} --`,
			}),
	},
]

describe(
	'lot prune --yes: a hand-made throwaway whose git read fails',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		for (const row of HAND_MADE_READS)
			it(`a clean worktree cut by hand at a landed lot’s tip, ${row.title} → listed under the lot, kept with why, its folder still there`, () => {
				const lot = landedLot()
				const handMade = addRedCheck(lot)

				expect(
					handMadeFateOf({
						result: pruneFailing({ lot, pattern: row.pattern(lot) }),
						lot,
						handMade,
					}),
				).toEqual({
					item: {
						decision: { kept: row.kept(lot) },
						outcome: { kept: row.kept(lot) },
					},
					there: true,
				})
			})
	},
)

/**
 * Two canceled lots, their worktrees removed: the first on `feat/x` with its one commit, the second on `feat/y` cut
 * from `feat/x` with a commit of its own. The first lot's commit only these two branches hold.
 */
function twoCanceledLotsSharingACommit(): LandingLot {
	const first = landingLotOf()
	const second = addLandingLot({
		lot: first,
		name: SECOND_LOT,
		branch: SECOND_BRANCH,
		from: first.branch,
	})
	for (const lot of [first, second]) {
		cancelLot(lot)
		removeLotWorktree(lot)
	}
	return first
}

/** Whether `commit` is a commit some branch reaches. */
function reachedByABranch(params: { lot: LandingLot; commit: string }): boolean {
	return (
		git({
			root: params.lot.workspace.repository,
			args: ['branch', '--contains', params.commit, '--format=%(refname:short)'],
		}).trim() !== ''
	)
}

describe(
	'lot prune: a branch whose commit another branch holds',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('two canceled lots’ branches holding one commit, the first lot planned alone → its branch goes, the other branch holding the commit', () => {
			const first = twoCanceledLotsSharingACommit()

			expect(
				prunedItemsOf({
					result: runLotPrune(lotPruneArgumentsOf({ lot: first, argv: [first.name] })),
					lot: first.name,
				})[`branch ${first.branch}`],
			).toEqual({ decision: { go: true } })
		})

		it('two canceled lots’ branches holding one commit, the other branch deleted between the plan and the delete → the first lot’s branch kept, the commit named, still reachable, exit 1', () => {
			const first = twoCanceledLotsSharingACommit()

			expect(
				((result: CommandResult) => ({
					...branchFateOf({ result, lot: first }),
					reachable: reachedByABranch({ lot: first, commit: first.tip }),
				}))(
					runLotPrune(
						lotPruneArgumentsOf({
							lot: first,
							argv: [first.name, '--yes'],
							onPlanned: function deleteOtherBranch() {
								git({
									root: first.workspace.repository,
									args: ['branch', '-D', SECOND_BRANCH],
								})
							},
						}),
					),
				),
			).toEqual({
				exitCode: 1,
				item: {
					decision: { go: true },
					outcome: {
						kept: `1 commit(s) its removal would lose: ${first.tip.slice(0, SHORT_SHA_LENGTH)}`,
					},
				},
				tip: first.tip,
				reachable: true,
			})
		})
	},
)

const UNREAD_WORKTREE_RECORDS: {
	title: string
	/** The words of the one read made to fail. */
	pattern: string
	/** The reason the worktree is kept with. */
	kept: (lot: LandingLot) => string
}[] = [
	{
		title: 'its HEAD reflog not read',
		pattern: 'reflog show --format=%H HEAD',
		kept: (lot) =>
			unreadOf({
				what: `the HEAD reflog of ${lot.worktree}`,
				args: 'reflog show --format=%H HEAD --',
			}),
	},
	{
		title: 'its own refs not read',
		pattern: 'refs/worktree/',
		kept: (lot) =>
			unreadOf({
				what: `the own refs of ${lot.worktree}`,
				args: 'for-each-ref --format=%(objectname) refs/worktree/ refs/bisect/',
			}),
	},
]

describe(
	'lot prune --yes: a landed lot whose worktree records cannot be read',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		for (const row of UNREAD_WORKTREE_RECORDS)
			it(`a landed lot’s worktree, ${row.title} → kept with why, its folder still there`, () => {
				const lot = landedLot()

				expect(
					((result: CommandResult) => ({
						item: prunedItemsOf({ result, lot: lot.name })[`worktree ${lot.worktree}`],
						there: existsSync(lot.worktree),
					}))(pruneFailing({ lot, pattern: row.pattern })),
				).toEqual({
					item: { decision: { kept: row.kept(lot) }, outcome: { kept: row.kept(lot) } },
					there: true,
				})
			})
	},
)
