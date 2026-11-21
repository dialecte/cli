/**
 * `dialecte lot prune` over a workspace, real git (DESIGN 3.2, 3.3, 3.9, tests 21, 23, 24, 25, 26, 29, 37, 53): the plan
 * lists every item of every lot with its decision and moves nothing; `--yes` acts through `lot close`'s own rules, writes
 * appended lines, landed facts and archived declarations only, and asks the host for a landing git cannot read.
 */
import { existsSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { writeStoreLot } from '../../test/brief-workspace.ts'
import {
	AFTER_LANDING_FILE,
	LANDING_LOT_FILE,
	LANDING_CHANGE_REQUEST_NUMBER,
	MAIN_EDIT_TEXT,
} from '../../test/landing-lot.constants.ts'
import {
	addLandingLot,
	addStackedLot,
	cancelLot,
	cardsLogOf,
	commitAfterLanding,
	landingLotOf,
	lotBranchTipOf,
	registerLotEntry,
	removeLotWorktree,
	writeLandedFact,
} from '../../test/landing-lot.ts'
import {
	amendLot,
	deleteOriginBranch,
	editOnOrigin,
	headOf,
	landingHostOf,
	mergeOnOrigin,
	changeRequestOf,
} from '../../test/landing-repository.ts'
import {
	changedBeyondAppends,
	runRecordedRemovals,
	filesOf,
	lotPruneArgumentsOf,
	prunedItemsOf,
	prunedLotOf,
	pruneRunOf,
	pruneUnreachable,
	recordedRoundOf,
	writeWaitingThrowaway,
} from '../../test/lot-prune-workspace.ts'
import { git } from '../../test/scratch-repository.ts'
import { transitionOf } from '../../test/store-records.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { createRecordingSpawner } from '../../test/worktree-pool.ts'
import { registeredEntryOf } from '../lib/handover/handover-store-read.ts'
import { handoverStoreOf } from '../lib/handover/handover-store.ts'
import { readLanded } from '../lib/landing/landed-record.ts'
import { resolveTddBase } from '../lib/tdd/tdd-base.ts'
import { runLotPrune } from './lot-prune.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LandingLot } from '../../test/landing-lot.types.ts'
import type { CommandResult } from '../lib/command-result.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The round's change of the lot's file. */
const ROUND_CHANGE = { [LANDING_LOT_FILE]: 'export const x = 11\n' }

/** The lots of the mixed workspace of tests 24 and 25. */
type MixedWorkspace = {
	committed: LandingLot
	canceled: LandingLot
	failed: LandingLot
	working: LandingLot
	simulated: string
}

/**
 * A committed lot whose merge git proves (fast-forward on origin, no landed fact yet), a canceled one, a failed one, a
 * working one, each on its own worktree and branch, and a simulated one (no worktree).
 */
function mixedWorkspace(): MixedWorkspace {
	const committed = landingLotOf()
	const canceled = addLandingLot({
		lot: committed,
		name: '0002-repo-stopped',
		branch: 'feat/stopped',
	})
	cancelLot(canceled)
	const failed = addLandingLot({
		lot: committed,
		name: '0003-repo-failed',
		branch: 'feat/failed',
		later: [transitionOf({ seq: 2, state: 'failed', kind: 'fail' })],
	})
	const working = addLandingLot({
		lot: committed,
		name: '0004-repo-working',
		branch: 'feat/working',
	})
	mergeOnOrigin({ repository: committed.repository, how: 'fast-forward' })
	const simulated = '0005-repo-simulated'
	writeSimulatedLot({ lot: committed, name: simulated })
	return { committed, canceled, failed, working, simulated }
}

/** A simulated store lot of the lot's workspace, written by the store's own writer: no worktree, no branch. */
function writeSimulatedLot(params: { lot: LandingLot; name: string }): void {
	writeStoreLot({
		workspace: params.lot.workspace,
		name: params.name,
		scope: ['src/simulated.ts'],
		simulated: true,
		repository: params.lot.workspace.repository,
	})
}

/** The commit the tdd base of the worktree at `root` names (its failure's text when it has none). */
function tddBaseCommitOf(root: string): string {
	const base = resolveTddBase({ root, packageJson: {} })
	return 'commit' in base ? base.commit : base.failure
}

/** The tip the lot's landed fact records; undefined when it has none (or a damaged one). */
function landedTipOf(lot: LandingLot): string | undefined {
	const landed = readLanded({ lotFolder: lot.lotFolder })
	return landed !== undefined && 'tip' in landed ? landed.tip : undefined
}

/** Every lot folder of the workspace's store and the registry, by path: their files' text. */
function recordsOf(lot: LandingLot): {
	store: Record<string, string>
	registry: Record<string, string>
} {
	return { store: filesOf(lot.workspace.store), registry: filesOf(lot.workspace.registry) }
}

/** The state of the registry entry registering the lot's folder, and when a close closed it; undefined for none. */
function lotEntryOf(lot: LandingLot): { state: string; closed?: string } | undefined {
	const entry = registeredEntryOf({
		store: handoverStoreOf(lot.workspace.repository),
		folder: lot.lotFolder,
	})
	return entry === undefined
		? undefined
		: { state: entry.state, ...(entry.closed !== undefined && { closed: entry.closed }) }
}

/** The decision kind of each item of each lot of a run: go, after, kept. */
function decisionKindsOf(result: CommandResult): Record<string, Record<string, string>> {
	return Object.fromEntries(
		pruneRunOf(result).output.lots.map((lot) => [
			lot.lot,
			Object.fromEntries(
				lot.items.map((item) => [`${item.item} ${item.name}`, Object.keys(item.decision)[0]]),
			),
		]),
	)
}

describe('lot prune: the plan over a mixed workspace', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('without --yes over committed, canceled, failed, simulated and open lots → every item listed with its decision, nothing moved, no cards.log line, no registry change, only the proven merge’s landed.json written', () => {
		const lots = mixedWorkspace()
		const { committed, canceled, failed, working } = lots
		const before = recordsOf(committed)

		expect(
			((result: CommandResult) => ({
				exitCode: result.exitCode,
				kinds: decisionKindsOf(result),
				simulated: prunedLotOf({ result, lot: lots.simulated }),
				worktrees: [committed, canceled, failed, working].map((lot) => existsSync(lot.worktree)),
				cardsLog: existsSync(cardsLogOf(committed)),
				registry: filesOf(committed.workspace.registry),
				landed: [committed, canceled, failed, working].map(landedTipOf),
			}))(runLotPrune(lotPruneArgumentsOf({ lot: committed, argv: [] }))),
		).toEqual({
			exitCode: 0,
			kinds: {
				[committed.name]: {
					[`worktree ${committed.worktree}`]: 'go',
					[`branch ${committed.branch}`]: 'after',
				},
				[canceled.name]: {
					[`worktree ${canceled.worktree}`]: 'go',
					[`branch ${canceled.branch}`]: 'kept',
				},
				[failed.name]: {
					[`worktree ${failed.worktree}`]: 'kept',
					[`branch ${failed.branch}`]: 'kept',
				},
				[working.name]: {
					[`worktree ${working.worktree}`]: 'kept',
					[`branch ${working.branch}`]: 'kept',
				},
				[lots.simulated]: {},
			},
			simulated: expect.objectContaining({ simulated: true }),
			worktrees: [true, true, true, true],
			cardsLog: false,
			registry: before.registry,
			landed: [committed.tip, undefined, undefined, undefined],
		})
	})

	it('--yes --all over the same → lot folders and records unchanged but for appended lines, landed facts and archived declarations; no registry entry created; the open and failed lots’ items untouched', () => {
		const lots = mixedWorkspace()
		const { committed, failed, working } = lots
		const before = recordsOf(committed)

		expect(
			((result: CommandResult) => ({
				exitCode: result.exitCode,
				store: changedBeyondAppends({
					before: before.store,
					after: filesOf(committed.workspace.store),
				}),
				entries: Object.keys(filesOf(committed.workspace.registry))
					.filter((path) => path.endsWith('.json'))
					.sort(),
				open: [failed, working].map((lot) => ({
					worktree: existsSync(lot.worktree),
					branch: lotBranchTipOf(lot),
				})),
				committedWorktree: existsSync(committed.worktree),
			}))(runLotPrune(lotPruneArgumentsOf({ lot: committed, argv: ['--all', '--yes'] }))),
		).toEqual({
			exitCode: 0,
			store: [],
			entries: Object.keys(before.registry)
				.filter((path) => path.endsWith('.json'))
				.sort(),
			open: [
				{ worktree: true, branch: failed.tip },
				{ worktree: true, branch: working.tip },
			],
			committedWorktree: false,
		})
	})
})

describe('lot prune: a lot’s branch and its landing', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('squash-merged, then one more commit another branch also holds, its worktree gone → the branch kept naming the work since its landing', () => {
		const lot = landingLotOf()
		mergeOnOrigin({ repository: lot.repository, how: 'squash' })
		writeLandedFact({ lot, tip: lot.tip })
		const after = commitAfterLanding({ lot, file: AFTER_LANDING_FILE })
		// held by another branch: deleting the lot's would lose nothing, its work since the landing is what keeps it
		git({ root: lot.workspace.repository, args: ['branch', 'keep-after', after] })
		removeLotWorktree(lot)

		expect(
			prunedItemsOf({
				result: runLotPrune(lotPruneArgumentsOf({ lot, argv: [lot.name] })),
				lot: lot.name,
			})[`branch ${lot.branch}`],
		).toEqual({
			decision: { kept: expect.stringContaining(`made since its landing: ${after.slice(0, 12)}`) },
		})
	})

	it('a child stacked on an amended then squashed parent; lot prune --yes on the parent → the parent’s branch kept as the child’s stack parent, the child’s tdd base unchanged', () => {
		const parent = landingLotOf()
		const child = addStackedLot({ lot: parent, name: '0002-repo-child', branch: 'feat/child' })
		const amended = amendLot({ worktree: parent.worktree })
		mergeOnOrigin({ repository: parent.repository, how: 'squash' })
		writeLandedFact({ lot: parent, tip: amended })
		const base = tddBaseCommitOf(child.worktree)

		expect(
			((result: CommandResult) => ({
				branch: prunedItemsOf({ result, lot: parent.name })[`branch ${parent.branch}`],
				tip: lotBranchTipOf(parent),
				base: tddBaseCommitOf(child.worktree),
			}))(runLotPrune(lotPruneArgumentsOf({ lot: parent, argv: [parent.name, '--yes'] }))),
		).toEqual({
			branch: {
				decision: { kept: `the stack parent of ${child.name} (working)` },
				outcome: { kept: `the stack parent of ${child.name} (working)` },
			},
			tip: amended,
			base,
		})
	})

	it('a squash main later edited, a host answering merged → --yes records landed.json by the host; the next run, once git’s background removal finished, deletes the branch', () => {
		const lot = landingLotOf()
		mergeOnOrigin({ repository: lot.repository, how: 'squash' })
		editOnOrigin({ repository: lot.repository, files: { [LANDING_LOT_FILE]: MAIN_EDIT_TEXT } })
		const host = landingHostOf({
			byBranch: {
				[lot.branch]: changeRequestOf({
					number: LANDING_CHANGE_REQUEST_NUMBER,
					state: 'merged',
					head: lot.tip,
				}),
			},
		}).host
		const { spawner, calls } = createRecordingSpawner()

		expect(
			((result: CommandResult) => ({
				exitCode: result.exitCode,
				landed: readLanded({ lotFolder: lot.lotFolder }),
			}))(
				runLotPrune(
					lotPruneArgumentsOf({
						lot,
						argv: [lot.name, '--yes'],
						host,
						spawner,
					}),
				),
			),
		).toEqual({ exitCode: 0, landed: expect.objectContaining({ how: 'host', tip: lot.tip }) })
		runRecordedRemovals(calls)
		expect(
			prunedItemsOf({
				result: runLotPrune(lotPruneArgumentsOf({ lot, argv: [lot.name, '--yes'], host })),
				lot: lot.name,
			})[`branch ${lot.branch}`],
		).toEqual({ decision: { go: true }, outcome: { removed: 'deleted' } })
	})

	it('the same with the host refusing, the lot committed by its hand-over → the branch kept as not landed, the host’s reason on its line', () => {
		const lot = landingLotOf()
		registerLotEntry({ lot })
		mergeOnOrigin({ repository: lot.repository, how: 'squash' })
		editOnOrigin({ repository: lot.repository, files: { [LANDING_LOT_FILE]: MAIN_EDIT_TEXT } })
		const refusal = 'the host cannot be reached: offline'
		const host = landingHostOf({ refusal }).host

		expect(
			prunedItemsOf({
				result: runLotPrune(lotPruneArgumentsOf({ lot, argv: [lot.name], host })),
				lot: lot.name,
			})[`branch ${lot.branch}`],
		).toEqual({
			decision: { kept: expect.stringMatching(new RegExp(`^not landed: .*${refusal}`)) },
		})
	})

	it('a squash-landed lot whose branch is gone, its landed tip’s object pruned, its throwaway branch waiting → decided, the landed tip named gone, no git fatal', () => {
		const lot = landingLotOf()
		const round = recordedRoundOf({ lot, round: 1, changed: ROUND_CHANGE })
		const landedTip = headOf(lot.worktree)
		mergeOnOrigin({ repository: lot.repository, how: 'squash' })
		writeLandedFact({ lot, tip: landedTip })
		writeWaitingThrowaway({ lot, round })
		removeLotWorktree(lot)
		deleteOriginBranch({ repository: lot.repository })
		git({ root: lot.workspace.repository, args: ['branch', '-D', lot.branch] })
		pruneUnreachable({ root: lot.workspace.repository, commit: landedTip })

		expect(
			((result: CommandResult) => ({
				exitCode: result.exitCode,
				landing: prunedLotOf({ result, lot: lot.name })?.landing,
				branch: Object.keys(
					prunedItemsOf({ result, lot: lot.name })[`branch ${round.branch}`]?.decision ?? {},
				),
			}))(runLotPrune(lotPruneArgumentsOf({ lot, argv: [lot.name] }))),
		).toEqual({
			exitCode: 0,
			landing: expect.stringContaining(`landed tip ${landedTip.slice(0, 12)} gone`),
			branch: [expect.stringMatching(/^(go|after|kept)$/)],
		})
	})
})

describe(
	'lot prune --yes: the lot’s worktree goes by lot close’s own rules',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('a file written into the lot’s worktree after the plan, before the move → kept, the file there', () => {
			const lot = landingLotOf()
			mergeOnOrigin({ repository: lot.repository, how: 'fast-forward' })
			writeLandedFact({ lot, tip: lot.tip })

			expect(
				((result: CommandResult) => ({
					worktree: prunedItemsOf({ result, lot: lot.name })[`worktree ${lot.worktree}`],
					there: existsSync(join(lot.worktree, 'late.txt')),
				}))(
					runLotPrune(
						lotPruneArgumentsOf({
							lot,
							argv: [lot.name, '--yes'],
							onPlanned: function writeLate() {
								writeFileSync(join(lot.worktree, 'late.txt'), 'a late note\n')
							},
						}),
					),
				),
			).toEqual({
				worktree: { decision: { go: true }, outcome: { kept: expect.any(String) } },
				there: true,
			})
		})

		it('lot prune --yes run from inside the lot’s worktree → kept, naming the folder it runs from', () => {
			const lot = landingLotOf()
			mergeOnOrigin({ repository: lot.repository, how: 'fast-forward' })
			writeLandedFact({ lot, tip: lot.tip })

			expect(
				prunedItemsOf({
					result: runLotPrune(
						lotPruneArgumentsOf({ lot, argv: [lot.name, '--yes'], cwd: lot.worktree }),
					),
					lot: lot.name,
				})[`worktree ${lot.worktree}`],
			).toEqual({
				decision: { kept: expect.stringContaining(`from inside ${realpathSync(lot.worktree)}`) },
				outcome: { kept: expect.stringContaining(`from inside ${realpathSync(lot.worktree)}`) },
			})
		})
	},
)

const PENDING_LANDED: { title: string; arrange: (lot: LandingLot) => void }[] = [
	{ title: 'merged by git, no landed fact yet', arrange: () => undefined },
	{
		title: 'its landed fact already written',
		arrange: (lot) => writeLandedFact({ lot, tip: lot.tip }),
	},
]

describe(
	'lot prune: a landed lot whose registry entry is still pending',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		for (const row of PENDING_LANDED)
			it(`${row.title}, its entry pending → the plan lets its worktree go; --yes closes it, the entry committed then closed`, () => {
				const lot = landingLotOf()
				registerLotEntry({ lot, state: 'pending' })
				mergeOnOrigin({ repository: lot.repository, how: 'fast-forward' })
				row.arrange(lot)

				expect(
					prunedItemsOf({
						result: runLotPrune(lotPruneArgumentsOf({ lot, argv: [lot.name] })),
						lot: lot.name,
					})[`worktree ${lot.worktree}`],
				).toEqual({ decision: { go: true } })
				expect(
					((result: CommandResult) => ({
						worktree: prunedItemsOf({ result, lot: lot.name })[`worktree ${lot.worktree}`],
						there: existsSync(lot.worktree),
						entry: lotEntryOf(lot),
					}))(runLotPrune(lotPruneArgumentsOf({ lot, argv: [lot.name, '--yes'] }))),
				).toEqual({
					worktree: {
						decision: { go: true },
						outcome: { removed: expect.stringMatching(/\/\.worktrees\/_trash\//) },
					},
					there: false,
					entry: { state: 'committed', closed: expect.any(String) },
				})
			})
	},
)
