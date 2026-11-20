/**
 * `lot prune` regressions, real git (DESIGN 3.1, 3.2, 3.5, 3.9, 3.11): a locked worktree whose folder is gone still
 * checks its branch out; a pending hand-over or a stash made between the plan and the delete keeps the branch; a
 * hand-over lock or a process met between the plan and a throwaway's move keeps it in place; a throwaway left in the
 * trash is listed with the move back and keeps its branch with that reason; a branch two lots reach is decided once,
 * the first keep winning; ids, `--feature` and `--all` exclude each other, and an index two stores hold is refused.
 */
import { existsSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { writeStoreLot } from '../../test/brief-workspace.ts'
import { LANDING_LOT_FILE, LANDING_NOW } from '../../test/landing-lot.constants.ts'
import {
	cancelLot,
	landingLotOf,
	lotBranchTipOf,
	removeLotWorktree,
	writeLandedFact,
} from '../../test/landing-lot.ts'
import { headOf, mergeOnOrigin } from '../../test/landing-repository.ts'
import {
	lotPruneArgumentsOf,
	prunedItemsOf,
	prunedLotOf,
	pruneRunOf,
	recordedRoundOf,
	runRecordedRemovals,
} from '../../test/lot-prune-workspace.ts'
import { createWorkspaceWithLots, writeStoreListFile } from '../../test/lot-stores.ts'
import { git, temporaryFolder } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { createRecordingSpawner } from '../../test/worktree-pool.ts'
import { handoverLockPath } from '../lib/handover/handover-lock.ts'
import { registerHandover } from '../lib/handover/handover-store.ts'
import { shellQuote } from '../lib/shell-quote.ts'
import { runLotPrune } from './lot-prune.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LandingLot } from '../../test/landing-lot.types.ts'
import type { RecordedRound } from '../../test/lot-prune-workspace.types.ts'
import type { CommandResult } from '../lib/command-result.types.ts'
import type { ProcessFolder } from '../lib/worktree/worktree.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The round's change: a fix of the lot's file, the same in the snapshot, the throwaway and the lot's next commit. */
const ROUND_CHANGE = { [LANDING_LOT_FILE]: 'export const x = 11\n' }

/** The pid a process list answers working in a throwaway once the plan is made. */
const LATE_PID = 4242

/** The second lot reaching the first lot's branch name. */
const SECOND_LOT = '0002-repo-y'

/** A run an hour after the landing cases' time: past the ten minutes git's background removal takes. */
const AN_HOUR_LATER = new Date(LANDING_NOW.getTime() + 60 * 60 * 1000)

/** A landed lot (fast-forward on origin, its landed fact) whose worktree an earlier close removed: only its branch left. */
function landedBranchOnly(): LandingLot {
	const lot = landingLotOf()
	mergeOnOrigin({ repository: lot.repository, how: 'fast-forward' })
	writeLandedFact({ lot, tip: lot.tip })
	removeLotWorktree(lot)
	return lot
}

/** A store lot with a recorded round throwaway, landed on main by a fast-forward, its landed fact written. */
function landedLotWithRound(): { lot: LandingLot; round: RecordedRound } {
	const lot = landingLotOf()
	const round = recordedRoundOf({ lot, round: 1, changed: ROUND_CHANGE })
	mergeOnOrigin({ repository: lot.repository, how: 'fast-forward' })
	writeLandedFact({ lot, tip: headOf(lot.worktree) })
	return { lot, round }
}

/** A worktree `path` locked by `git worktree lock`, then its folder moved away (a volume not mounted now). */
function lockAndMoveAway(params: { lot: LandingLot; path: string }): void {
	git({ root: params.lot.workspace.repository, args: ['worktree', 'lock', params.path] })
	renameSync(params.path, join(realpathSync(temporaryFolder('dialecte-away-')), 'moved'))
}

/** The branch item of `branch` in the lot's part of a `lot prune --json` run, and the branch's tip after the run. */
function branchFateOf(params: { result: CommandResult; lot: LandingLot; branch: string }) {
	return {
		item: prunedItemsOf({ result: params.result, lot: params.lot.name })[`branch ${params.branch}`],
		tip: lotBranchTipOf({ ...params.lot, branch: params.branch }),
	}
}

const LOCKED_GONE: {
	title: string
	arrange: () => { lot: LandingLot; path: string; branch: string; tip: string }
}[] = [
	{
		title: 'another worktree on the lot’s branch, locked, its folder moved away',
		arrange: function lockedOnLotBranch() {
			const lot = landedBranchOnly()
			const path = join(realpathSync(temporaryFolder('dialecte-locked-')), 'other')
			git({ root: lot.workspace.repository, args: ['worktree', 'add', '-q', path, lot.branch] })
			lockAndMoveAway({ lot, path })
			return { lot, path, branch: lot.branch, tip: lot.tip }
		},
	},
	{
		title: 'a recorded throwaway, locked, its folder moved away',
		arrange: function lockedThrowaway() {
			const { lot, round } = landedLotWithRound()
			lockAndMoveAway({ lot, path: round.path })
			return { lot, path: round.path, branch: round.branch, tip: round.tip }
		},
	},
]

describe(
	'lot prune --yes: a locked worktree whose folder is gone',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		for (const row of LOCKED_GONE)
			it(`${row.title} → its branch kept, checked out in that worktree, never deleted`, () => {
				const { lot, path, branch, tip } = row.arrange()

				expect(
					branchFateOf({
						result: runLotPrune(lotPruneArgumentsOf({ lot, argv: [lot.name, '--yes'] })),
						lot,
						branch,
					}),
				).toEqual({
					item: expect.objectContaining({ outcome: { kept: `checked out in ${path}` } }),
					tip,
				})
			})
	},
)

const HELD_SINCE_PLAN: { title: string; arrange: (lot: LandingLot) => string }[] = [
	{
		title: 'a hand-over registered pending on the branch',
		arrange: function registerPending(lot) {
			const name = registerHandover({
				root: lot.workspace.repository,
				folder: realpathSync(temporaryFolder('dialecte-handover-')),
				branch: lot.branch,
				now: LANDING_NOW,
			})
			return `a hand-over is pending on it: ${name}`
		},
	},
	{
		title: 'a stash made on the branch',
		arrange: function stashOnBranch(lot) {
			const path = join(realpathSync(temporaryFolder('dialecte-stash-')), 'stash')
			git({ root: lot.workspace.repository, args: ['worktree', 'add', '-q', path, lot.branch] })
			writeFileSync(join(path, LANDING_LOT_FILE), 'export const x = 99\n')
			git({ root: path, args: ['stash', 'push', '-q', '-m', 'a note'] })
			git({ root: lot.workspace.repository, args: ['worktree', 'remove', '--force', path] })
			return 'a stash was made on it'
		},
	},
	{
		title: 'the main checkout switched to the branch',
		arrange: function checkOutInMain(lot) {
			git({ root: lot.workspace.repository, args: ['checkout', '-q', lot.branch] })
			return 'the branch the main checkout is on'
		},
	},
]

describe(
	'lot prune --yes: a branch held between the plan and the delete',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		for (const row of HELD_SINCE_PLAN)
			it(`${row.title} between the plan and the delete → the branch kept with why, its tip untouched`, () => {
				const lot = landedBranchOnly()
				const reasons: string[] = []

				expect(
					((result: CommandResult) => ({
						...branchFateOf({ result, lot, branch: lot.branch }),
						reasons,
					}))(
						runLotPrune(
							lotPruneArgumentsOf({
								lot,
								argv: [lot.name, '--yes'],
								onPlanned: function holdBranch() {
									reasons.push(row.arrange(lot))
								},
							}),
						),
					),
				).toEqual({
					item: { decision: { go: true }, outcome: { kept: reasons[0] } },
					tip: lot.tip,
					reasons: [expect.any(String)],
				})
			})
	},
)

const MET_BEFORE_MOVE: {
	title: string
	/** Done once the plan is made: the processes the list answers from then on. */
	atPlan: (round: RecordedRound) => ProcessFolder[]
	kept: string
}[] = [
	{
		title: 'a hand-over lock written in the throwaway',
		atPlan: function writeLock(round) {
			writeFileSync(handoverLockPath(round.path), `${LATE_PID}\n`)
			return []
		},
		kept: 'a hand-over runs in it',
	},
	{
		title: 'a process listed working in the throwaway',
		atPlan: function processIn(round) {
			return [{ pid: LATE_PID, folder: round.path }]
		},
		kept: `a process works in it: pid ${LATE_PID}`,
	},
]

describe(
	'lot prune --yes: a throwaway held between the plan and its move',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		for (const row of MET_BEFORE_MOVE)
			it(`${row.title} between the plan and its move → kept with why, its folder still there, not moved`, () => {
				const { lot, round } = landedLotWithRound()
				const listed: ProcessFolder[] = []

				expect(
					((result: CommandResult) => ({
						item: prunedItemsOf({ result, lot: lot.name })[`throwaway ${round.path}`],
						there: existsSync(join(round.path, '.git')),
					}))(
						runLotPrune({
							...lotPruneArgumentsOf({
								lot,
								argv: [lot.name, '--yes'],
								onPlanned: function holdThrowaway() {
									listed.push(...row.atPlan(round))
								},
							}),
							listProcesses: function listedSincePlan() {
								return [...listed]
							},
						}),
					),
				).toEqual({
					item: { decision: { go: true }, outcome: { kept: row.kept } },
					there: true,
				})
			})
	},
)

describe(
	'lot prune: a throwaway left in the trash by its proof',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('a throwaway its second proof left in the trash, a later run an hour after → listed refused with the move back to its place, its branch kept with the left-in-trash reason', () => {
			const { lot, round } = landedLotWithRound()
			const moved: string[] = []
			const { spawner, calls } = createRecordingSpawner()
			const first = runLotPrune(
				lotPruneArgumentsOf({
					lot,
					argv: [lot.name, '--yes'],
					spawner,
					afterThrowawayMove: function writeLate(trashed) {
						moved.push(trashed)
						writeFileSync(join(trashed, 'late.txt'), 'a late note\n')
					},
				}),
			)
			runRecordedRemovals(calls)
			const reason = prunedItemsOf({ result: first, lot: lot.name })[`throwaway ${round.path}`]
				?.outcome
			const trashed = moved.map((path) => realpathSync(path))
			const main = realpathSync(lot.workspace.repository)

			expect(
				((result: CommandResult) => ({
					refused: pruneRunOf(result).output.refused,
					branch: prunedItemsOf({ result, lot: lot.name })[`branch ${round.branch}`]?.outcome,
				}))(
					runLotPrune(lotPruneArgumentsOf({ lot, argv: [lot.name, '--yes'], now: AN_HOUR_LATER })),
				),
			).toEqual({
				refused: trashed.map((path) => ({
					worktree: path,
					status: expect.stringContaining('late.txt'),
					command: `cd ${shellQuote(main)} && git worktree move ${shellQuote(path)} ${shellQuote(round.path)}`,
					left: reason !== undefined && 'kept' in reason ? reason.kept : '<no reason>',
				})),
				branch: reason,
			})
		})
	},
)

/**
 * Two lots on one branch name: the first canceled (its commit also held by another branch: nothing lost), its
 * worktree closed; the second committed, its worktree gone, not landed.
 */
function twoLotsOnOneBranch(): { first: LandingLot; second: string } {
	const first = landingLotOf()
	git({ root: first.workspace.repository, args: ['branch', 'keep/x', first.tip] })
	cancelLot(first)
	removeLotWorktree(first)
	writeStoreLot({
		workspace: first.workspace,
		name: SECOND_LOT,
		scope: [LANDING_LOT_FILE],
		branch: first.branch,
		repository: first.workspace.repository,
		base: { ref: 'main', commit: first.workspace.commit },
		registry: 'committed',
	})
	return { first, second: SECOND_LOT }
}

describe('lot prune: a branch two lots reach', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('the first lot’s rules letting the branch go, the second’s keeping it → kept with the second’s reason, listed once, its tip untouched', () => {
		const { first, second } = twoLotsOnOneBranch()
		/** The second lot's own keep: its landing line, as the run printed it. */
		const keeps: { kept: string | undefined }[] = []

		expect(
			((result: CommandResult) => {
				keeps.push({ kept: prunedLotOf({ result, lot: second })?.landing })
				return {
					...branchFateOf({ result, lot: first, branch: first.branch }),
					underSecond: prunedItemsOf({ result, lot: second })[`branch ${first.branch}`],
					secondKeep: keeps[0],
				}
			})(runLotPrune(lotPruneArgumentsOf({ lot: first, argv: [first.name, second, '--yes'] }))),
		).toEqual({
			item: { decision: keeps[0], outcome: keeps[0] },
			tip: first.tip,
			underSecond: undefined,
			secondKeep: keeps[0],
		})
	})
})

const REFUSED_SELECTIONS: {
	title: string
	arrange: () => { cwd: string; argv: string[]; line: string }
}[] = [
	{
		title: '--feature x --all',
		arrange: function featureAndAll() {
			const { workspace } = createWorkspaceWithLots({ names: ['0001-repo-a'] })
			return {
				cwd: workspace.repository,
				argv: ['--feature', 'x', '--all'],
				line: 'usage: dialecte lot prune [<id>...] [--feature <name>] [--all] [--yes] [--json] (ids, --feature and --all exclude each other)',
			}
		},
	},
	{
		title: 'an index two stores of the list hold',
		arrange: function indexInTwoStores() {
			const one = createWorkspaceWithLots({ names: ['0005-repo-a'] })
			const two = createWorkspaceWithLots({ names: ['0005-repo-b'] })
			writeStoreListFile({
				stores: [realpathSync(one.workspace.store), realpathSync(two.workspace.store)],
			})
			return {
				cwd: one.workspace.repository,
				argv: ['0005'],
				line: '0005 names several lots: give the full name or the folder',
			}
		},
	},
]

describe('lot prune: a selection it refuses', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of REFUSED_SELECTIONS)
		it(`${row.title} → exit 2, the refusal line printed`, () => {
			const { cwd, argv, line } = row.arrange()

			expect(
				((result: CommandResult) => ({
					exitCode: result.exitCode,
					printed: result.output.split('\n').includes(line),
				}))(runLotPrune({ cwd, argv, listProcesses: () => [], scratchRoots: [] })),
			).toEqual({ exitCode: 2, printed: true })
		})
})
