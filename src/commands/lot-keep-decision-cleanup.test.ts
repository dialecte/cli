/**
 * Every cleanup keeps a kept lot (KEEP 3.5), real worktrees and branches: `lot close` and `lot prune` keep every item of
 * a kept lot with `kept by decision: <why>`, before any proof; a keep (or a damage, or a folder gone) met at the move
 * keeps the worktree, the throwaway in either proof and every branch, the run exiting 1; `worktree prune` holds a kept
 * lot's items and every damaged lot's; `--reclaim` never touches a kept lot's own worktree.
 */
import { existsSync, readFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'

import { createBriefWorkspace } from '../../test/brief-workspace.ts'
import { TRANSITION_DAMAGE, UNKEEP_REASON } from '../../test/keep-decision-workspace.constants.ts'
import {
	damageLot,
	damagedTextOf,
	goneTextOf,
	keptTextOf,
	writeKeepDocument,
	writeKeepLine,
} from '../../test/keep-decision-workspace.ts'
import { worktreePruneItemsOf } from '../../test/keep-decision-workspace.ts'
import {
	cancelLot,
	closeArgumentsOf,
	closeOutcomesOf,
	landingLotOf,
	registerLotEntry,
	removeLotWorktree,
	writeLandedFact,
} from '../../test/landing-lot.ts'
import { headOf, landingHostOf, mergeOnOrigin } from '../../test/landing-repository.ts'
import { addLotWorktree, pointIdentityAt } from '../../test/lot-keep-workspace.ts'
import {
	lotPruneArgumentsOf,
	prunedItemsOf,
	recordedRoundOf,
	removalsOf,
	writeWaitingThrowaway,
} from '../../test/lot-prune-workspace.ts'
import {
	addReclaimWorktree,
	ageEverything,
	createReclaimWorkspace,
} from '../../test/reclaim-workspace.ts'
import { git, temporaryFolder } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { MARKER_FILE, POOL_COMMAND_CASE_MS } from '../../test/worktree-pool.constants.ts'
import { createFakeNodeModules, createRecordingSpawner } from '../../test/worktree-pool.ts'
import { readHealthRepository } from '../lib/health/read-health-context.ts'
import { findIdleWorktrees } from '../lib/health/rule-worktrees.ts'
import { runLotClose } from './lot-close.ts'
import { runLotPrune } from './lot-prune.ts'
import { runLot } from './lot.ts'
import { runWorktreePrune } from './worktree.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BriefWorkspace } from '../../test/brief-workspace.types.ts'
import type { LandingLot } from '../../test/landing-lot.types.ts'
import type { RecordedRound } from '../../test/lot-prune-workspace.types.ts'
import type { CommandResult } from '../lib/command-result.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The kept text of the cases' keep line. */
const KEPT = keptTextOf()

/** A round's change: a fix of the lot's file. */
const ROUND_CHANGE = { 'src/x.ts': 'export const x = 11\n' }

/** A trash path, whatever its time stamp. */
const TRASHED = expect.stringMatching(/\/\.worktrees\/_trash\//)

/** A store lot landed on main by a fast-forward, its landed fact written; with a recorded round throwaway when asked. */
function landedLot(params: { round?: boolean } = {}): {
	lot: LandingLot
	round: RecordedRound | undefined
} {
	const lot = landingLotOf()
	const round =
		params.round === true ? recordedRoundOf({ lot, round: 1, changed: ROUND_CHANGE }) : undefined
	mergeOnOrigin({ repository: lot.repository, how: 'fast-forward' })
	writeLandedFact({ lot, tip: headOf(lot.worktree) })
	return { lot, round }
}

/** `lot prune <lot> [--yes] --json`, with the seams given. */
function pruned(params: {
	lot: LandingLot
	yes?: boolean
	onPlanned?: () => void
	afterThrowawayMove?: (trashed: string) => void
	spawner?: ReturnType<typeof createRecordingSpawner>['spawner']
}): CommandResult {
	const { lot } = params
	return runLotPrune(
		lotPruneArgumentsOf({
			lot,
			argv: [lot.name, ...(params.yes === true ? ['--yes'] : [])],
			...(params.onPlanned !== undefined && { onPlanned: params.onPlanned }),
			...(params.afterThrowawayMove !== undefined && {
				afterThrowawayMove: params.afterThrowawayMove,
			}),
			...(params.spawner !== undefined && { spawner: params.spawner }),
		}),
	)
}

/** `lot close <names> --json` of the lot's repository. */
function closed(params: { lot: LandingLot; names: string[] }): CommandResult {
	return runLotClose(closeArgumentsOf({ ...params, host: landingHostOf({}).host }))
}

describe('lot close of a kept lot', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a committed landed lot, kept, its worktree clean and branch merged: lot close <id> → kept with the kept text, exit 1, nothing moved, no removing line', () => {
		const { lot } = landedLot()
		writeKeepLine({ lotFolder: lot.lotFolder })

		expect(
			((result: CommandResult) => ({
				exitCode: result.exitCode,
				outcomes: closeOutcomesOf(result),
				worktree: existsSync(lot.worktree),
				removals: removalsOf(lot),
			}))(closed({ lot, names: [lot.name] })),
		).toEqual({
			exitCode: 1,
			outcomes: [
				{
					closed: false,
					kept: expect.stringContaining(KEPT),
					landed: expect.stringContaining('landed on'),
				},
			],
			worktree: true,
			removals: [],
		})
	})

	it('the same lot closed by its committed hand-over entry → kept with the kept text', () => {
		const { lot } = landedLot()
		const entry = registerLotEntry({ lot })
		writeKeepLine({ lotFolder: lot.lotFolder })

		expect(
			((result: CommandResult) => ({
				outcomes: closeOutcomesOf(result),
				worktree: existsSync(lot.worktree),
			}))(closed({ lot, names: [entry] })),
		).toEqual({
			outcomes: [
				{
					closed: false,
					kept: expect.stringContaining(KEPT),
					landed: expect.stringContaining('landed on'),
				},
			],
			worktree: true,
		})
	})

	it('a canceled kept lot: lot close <id> → kept with the kept text', () => {
		const lot = landingLotOf()
		cancelLot(lot)
		writeKeepLine({ lotFolder: lot.lotFolder })

		expect(closeOutcomesOf(closed({ lot, names: [lot.name] }))).toEqual([
			{ closed: false, kept: expect.stringContaining(KEPT) },
		])
	})
})

describe(
	'lot prune of a kept lot: every item kept before any proof',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('committed, kept, a recorded review throwaway → the worktree, the throwaway and both branches each kept with the kept text', () => {
			const { lot, round } = landedLot({ round: true })
			if (round === undefined) throw new Error('no round')
			writeKeepLine({ lotFolder: lot.lotFolder })

			expect(prunedItemsOf({ result: pruned({ lot }), lot: lot.name })).toEqual({
				[`worktree ${lot.worktree}`]: { decision: { kept: KEPT } },
				[`throwaway ${round.path}`]: { decision: { kept: KEPT } },
				[`branch ${lot.branch}`]: { decision: { kept: KEPT } },
				[`branch ${round.branch}`]: { decision: { kept: KEPT } },
			})
		})

		it('the same with --yes → nothing moved, nothing deleted, exit 0 (nothing was planned to go)', () => {
			const { lot, round } = landedLot({ round: true })
			if (round === undefined) throw new Error('no round')
			writeKeepLine({ lotFolder: lot.lotFolder })

			expect(
				((result: CommandResult) => ({
					exitCode: result.exitCode,
					left: [existsSync(lot.worktree), existsSync(round.path)],
					branches: git({
						root: lot.workspace.repository,
						args: ['branch', '--list', '--format=%(refname:short)'],
					})
						.split('\n')
						.filter((branch) => branch === lot.branch || branch === round.branch)
						.sort(),
					removals: removalsOf(lot),
				}))(pruned({ lot, yes: true })),
			).toEqual({
				exitCode: 0,
				left: [true, true],
				branches: [lot.branch, round.branch].sort(),
				removals: [],
			})
		})

		it('canceled, kept, its branch with commits main does not hold → the branch kept with the kept text, never the delete-anyway line', () => {
			const lot = landingLotOf()
			cancelLot(lot)
			writeKeepLine({ lotFolder: lot.lotFolder })

			expect(
				prunedItemsOf({ result: pruned({ lot }), lot: lot.name })[`branch ${lot.branch}`],
			).toEqual({
				decision: { kept: KEPT },
			})
		})

		it('damaged (a transition file that does not hold), kept → every item kept with the kept text (kept before damaged)', () => {
			const lot = landingLotOf()
			damageLot({ lotFolder: lot.lotFolder })
			writeKeepLine({ lotFolder: lot.lotFolder })

			expect(prunedItemsOf({ result: pruned({ lot }), lot: lot.name })).toEqual({
				[`worktree ${lot.worktree}`]: { decision: { kept: KEPT } },
				[`branch ${lot.branch}`]: { decision: { kept: KEPT } },
			})
		})

		it('committed, its keep.jsonl torn (no line feed) → every item kept with the unreadable text; lot status reads it committed, not damaged', () => {
			const { lot } = landedLot()
			writeKeepDocument({ lotFolder: lot.lotFolder, text: '{"schema":1,"op":"keep"' })
			const unreadable = 'kept: keep.jsonl holds 1 line(s) that do not read'

			expect(
				((result: CommandResult) => ({
					items: prunedItemsOf({ result, lot: lot.name }),
					state: (
						JSON.parse(
							runLot({ cwd: lot.workspace.repository, argv: ['status', lot.name, '--json'] })
								.output,
						) as { state: string }
					).state,
				}))(pruned({ lot })),
			).toEqual({
				items: {
					[`worktree ${lot.worktree}`]: { decision: { kept: unreadable } },
					[`branch ${lot.branch}`]: { decision: { kept: unreadable } },
				},
				state: 'committed',
			})
		})

		it('committed, kept then unkept → --yes: the items go as without a keep; its status JSON reads kept null', () => {
			const { lot, round } = landedLot({ round: true })
			if (round === undefined) throw new Error('no round')
			writeKeepLine({ lotFolder: lot.lotFolder })
			writeKeepLine({ lotFolder: lot.lotFolder, op: 'unkeep', reason: UNKEEP_REASON })

			expect(
				((result: CommandResult) => ({
					worktree: prunedItemsOf({ result, lot: lot.name })[`worktree ${lot.worktree}`],
					throwaway: prunedItemsOf({ result, lot: lot.name })[`throwaway ${round.path}`],
					kept: (
						JSON.parse(
							runLot({ cwd: lot.workspace.repository, argv: ['status', lot.name, '--json'] })
								.output,
						) as { kept?: unknown }
					).kept,
				}))(pruned({ lot, yes: true })),
			).toEqual({
				worktree: { decision: { go: true }, outcome: { removed: TRASHED } },
				throwaway: { decision: { go: true }, outcome: { removed: TRASHED } },
				kept: null,
			})
		})
	},
)

describe('lot prune --yes: a keep met at the move', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('committed, not kept, a keep written once planned → its worktree kept at the move, its own branch (still checked out by it) kept with the kept text, never checked out; exit 1', () => {
		const { lot } = landedLot()

		expect(
			((result: CommandResult) => ({
				exitCode: result.exitCode,
				items: prunedItemsOf({ result, lot: lot.name }),
				worktree: existsSync(lot.worktree),
			}))(pruned({ lot, yes: true, onPlanned: () => writeKeepLine({ lotFolder: lot.lotFolder }) })),
		).toEqual({
			exitCode: 1,
			items: {
				[`worktree ${lot.worktree}`]: {
					decision: { go: true },
					outcome: { kept: expect.stringContaining(KEPT) },
				},
				[`branch ${lot.branch}`]: {
					decision: { after: lot.worktree },
					outcome: { kept: expect.stringContaining(KEPT) },
				},
			},
			worktree: true,
		})
	})

	it('committed, not kept, a recorded throwaway, a keep written once planned → the throwaway kept at its first proof, still in place; exit 1', () => {
		const { lot, round } = landedLot({ round: true })
		if (round === undefined) throw new Error('no round')

		expect(
			((result: CommandResult) => ({
				exitCode: result.exitCode,
				item: prunedItemsOf({ result, lot: lot.name })[`throwaway ${round.path}`],
				there: existsSync(round.path),
			}))(pruned({ lot, yes: true, onPlanned: () => writeKeepLine({ lotFolder: lot.lotFolder }) })),
		).toEqual({
			exitCode: 1,
			item: { decision: { go: true }, outcome: { kept: expect.stringContaining(KEPT) } },
			there: true,
		})
	})

	it('committed, not kept, a recorded throwaway, a keep written once it moved → kept at its second proof: left in the trash, registered, no --force removal started; exit 1', () => {
		const { lot, round } = landedLot({ round: true })
		if (round === undefined) throw new Error('no round')
		const moved: string[] = []
		const { spawner, calls } = createRecordingSpawner()

		expect(
			((result: CommandResult) => ({
				exitCode: result.exitCode,
				item: prunedItemsOf({ result, lot: lot.name })[`throwaway ${round.path}`],
				left: moved.map((trashed) => existsSync(trashed)),
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
				pruned({
					lot,
					yes: true,
					spawner,
					afterThrowawayMove: function keepNow(trashed) {
						moved.push(trashed)
						writeKeepLine({ lotFolder: lot.lotFolder })
					},
				}),
			),
		).toEqual({
			exitCode: 1,
			item: { decision: { go: true }, outcome: { kept: expect.stringContaining(KEPT) } },
			left: [true],
			registered: [true],
			removals: [],
		})
	})

	it('committed, not kept, its worktree gone, its own branch merged and checked out nowhere, a keep written once planned → the branch kept at the move with the kept text; exit 1', () => {
		const { lot } = landedLot()
		removeLotWorktree(lot)

		expect(
			((result: CommandResult) => ({
				exitCode: result.exitCode,
				item: prunedItemsOf({ result, lot: lot.name })[`branch ${lot.branch}`],
			}))(pruned({ lot, yes: true, onPlanned: () => writeKeepLine({ lotFolder: lot.lotFolder }) })),
		).toEqual({
			exitCode: 1,
			item: { decision: { go: true }, outcome: { kept: expect.stringContaining(KEPT) } },
		})
	})

	it('committed, not kept, a waiting throwaway branch (its worktree gone), a keep written once planned → that branch kept at the move with the kept text; exit 1', () => {
		const { lot, round } = landedLot({ round: true })
		if (round === undefined) throw new Error('no round')
		writeWaitingThrowaway({ lot, round })

		expect(
			((result: CommandResult) => ({
				exitCode: result.exitCode,
				item: prunedItemsOf({ result, lot: lot.name })[`branch ${round.branch}`],
			}))(pruned({ lot, yes: true, onPlanned: () => writeKeepLine({ lotFolder: lot.lotFolder }) })),
		).toEqual({
			exitCode: 1,
			item: { decision: { go: true }, outcome: { kept: expect.stringContaining(KEPT) } },
		})
	})

	it('committed, not kept, a recorded throwaway, the lot made damaged once planned → the throwaway kept with the damaged text', () => {
		const { lot, round } = landedLot({ round: true })
		if (round === undefined) throw new Error('no round')

		expect(
			((result: CommandResult) => ({
				item: prunedItemsOf({ result, lot: lot.name })[`throwaway ${round.path}`],
				there: existsSync(round.path),
			}))(pruned({ lot, yes: true, onPlanned: () => damageLot({ lotFolder: lot.lotFolder }) })),
		).toEqual({
			item: {
				decision: { go: true },
				outcome: {
					kept: expect.stringContaining(
						damagedTextOf({ name: lot.name, damage: TRANSITION_DAMAGE }),
					),
				},
			},
			there: true,
		})
	})

	it('committed, not kept, its worktree gone, its own branch merged, the lot made damaged once planned → the branch kept with the damaged text', () => {
		const { lot } = landedLot()
		removeLotWorktree(lot)

		expect(
			prunedItemsOf({
				result: pruned({
					lot,
					yes: true,
					onPlanned: () => damageLot({ lotFolder: lot.lotFolder }),
				}),
				lot: lot.name,
			})[`branch ${lot.branch}`],
		).toEqual({
			decision: { go: true },
			outcome: {
				kept: expect.stringContaining(damagedTextOf({ name: lot.name, damage: TRANSITION_DAMAGE })),
			},
		})
	})

	it('committed, not kept, a recorded throwaway, the lot folder moved out of the store once planned → the throwaway and its branch kept, no longer in the store', () => {
		const { lot, round } = landedLot({ round: true })
		if (round === undefined) throw new Error('no round')

		expect(
			((result: CommandResult) => ({
				throwaway: prunedItemsOf({ result, lot: lot.name })[`throwaway ${round.path}`]?.outcome,
				branch: prunedItemsOf({ result, lot: lot.name })[`branch ${round.branch}`]?.outcome,
				there: existsSync(round.path),
			}))(
				pruned({
					lot,
					yes: true,
					onPlanned: () =>
						renameSync(lot.lotFolder, join(temporaryFolder('dialecte-moved-lot-'), lot.name)),
				}),
			),
		).toEqual({
			throwaway: { kept: expect.stringContaining(goneTextOf(lot.name)) },
			branch: { kept: expect.stringContaining(goneTextOf(lot.name)) },
			there: true,
		})
	})
})

/** `worktree prune --json` of the workspace: the plan only. */
async function worktreePruneOf(workspace: BriefWorkspace): Promise<Record<string, string>> {
	const result = await runWorktreePrune({
		argv: ['--root', workspace.workspace, '--json'],
		cwd: workspace.workspace,
		scratchRoot: temporaryFolder('dialecte-scratch-root-'),
		isTerminal: false,
		confirm: async function never() {
			return false
		},
	})
	return worktreePruneItemsOf(result)
}

const NAME = '0001-repo-kept'
const OTHER_NAME = '0002-repo-other'

/** A `-round-1` throwaway beside the lot's worktree, on `<lot branch>-round-1` at the lot's tip (merged, clean). */
function addThrowawayOf(params: {
	workspace: BriefWorkspace
	worktree: string
	branch: string
}): string {
	git({
		root: params.workspace.repository,
		args: [
			'worktree',
			'add',
			'-q',
			'-b',
			`${params.branch}-round-1`,
			`${params.worktree}-round-1`,
			params.branch,
		],
	})
	return `${params.branch}-round-1`
}

describe(
	'worktree prune holds a kept lot’s items and every damaged lot’s',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('committed, kept → its worktree line is the kept text; its branch gets no line', async () => {
			const workspace = createBriefWorkspace()
			const lot = addLotWorktree({ workspace, name: NAME, state: 'committed' })
			writeKeepLine({ lotFolder: lot.lotFolder })

			await expect(worktreePruneOf(workspace)).resolves.toEqual({
				[`worktree ${NAME}`]: `${lot.branch}: ${KEPT}`,
			})
		})

		it('two committed lots naming one worktree, the kept one read first, a review throwaway beside it → the throwaway line keeps the kept text, never the other lot’s own item', async () => {
			const workspace = createBriefWorkspace()
			const lot = addLotWorktree({ workspace, name: NAME, state: 'committed' })
			const other = addLotWorktree({ workspace, name: OTHER_NAME, state: 'committed' })
			pointIdentityAt({ lotFolder: other.lotFolder, worktree: lot.worktree })
			const roundBranch = addThrowawayOf({ workspace, worktree: lot.worktree, branch: lot.branch })
			writeKeepLine({ lotFolder: lot.lotFolder })

			await expect(worktreePruneOf(workspace)).resolves.toEqual(
				expect.objectContaining({ [`worktree ${NAME}-round-1`]: `${roundBranch}: ${KEPT}` }),
			)
		})

		it('committed, kept, its worktree gone, its own branch merged → the branch line is the kept text, never its own item for lot prune', async () => {
			const workspace = createBriefWorkspace()
			const lot = addLotWorktree({ workspace, name: NAME, state: 'committed' })
			git({ root: workspace.repository, args: ['worktree', 'remove', '--force', lot.worktree] })
			writeKeepLine({ lotFolder: lot.lotFolder })

			await expect(worktreePruneOf(workspace)).resolves.toEqual({ [`branch ${lot.branch}`]: KEPT })
		})

		it('committed, kept, its review throwaway present → the throwaway’s line is the kept text', async () => {
			const workspace = createBriefWorkspace()
			const lot = addLotWorktree({ workspace, name: NAME, state: 'committed' })
			const roundBranch = addThrowawayOf({ workspace, worktree: lot.worktree, branch: lot.branch })
			writeKeepLine({ lotFolder: lot.lotFolder })

			await expect(worktreePruneOf(workspace)).resolves.toMatchObject({
				[`worktree ${NAME}-round-1`]: `${roundBranch}: ${KEPT}`,
			})
		})

		it('damaged, kept, a clean review throwaway on a merged branch, its own branch merged and its worktree gone → both kept with the kept text, no removal offered', async () => {
			const workspace = createBriefWorkspace()
			const lot = addLotWorktree({ workspace, name: NAME, state: 'committed' })
			const roundBranch = addThrowawayOf({ workspace, worktree: lot.worktree, branch: lot.branch })
			git({ root: workspace.repository, args: ['worktree', 'remove', '--force', lot.worktree] })
			damageLot({ lotFolder: lot.lotFolder })
			writeKeepLine({ lotFolder: lot.lotFolder })

			await expect(worktreePruneOf(workspace)).resolves.toEqual({
				[`worktree ${NAME}-round-1`]: `${roundBranch}: ${KEPT}`,
				[`branch ${lot.branch}`]: KEPT,
			})
		})

		it('damaged, not kept, the same items → both kept, reason lot <name> damaged', async () => {
			const workspace = createBriefWorkspace()
			const lot = addLotWorktree({ workspace, name: NAME, state: 'committed' })
			const roundBranch = addThrowawayOf({ workspace, worktree: lot.worktree, branch: lot.branch })
			git({ root: workspace.repository, args: ['worktree', 'remove', '--force', lot.worktree] })
			damageLot({ lotFolder: lot.lotFolder })

			await expect(worktreePruneOf(workspace)).resolves.toEqual({
				[`worktree ${NAME}-round-1`]: `${roundBranch}: lot ${NAME} damaged`,
				[`branch ${lot.branch}`]: `lot ${NAME} damaged`,
			})
		})
	},
)

describe('worktree prune --reclaim and a kept lot', { timeout: POOL_COMMAND_CASE_MS }, () => {
	it('committed, kept, idle → its own worktree kept, its node_modules in place; its review throwaway reclaimed as an open lot’s', async () => {
		const workspace = createReclaimWorkspace()
		const own = addReclaimWorktree({ workspace, name: NAME, lot: 'committed', marker: NAME })
		const lotFolder = join(workspace.store, NAME)
		addThrowawayOf({ workspace, worktree: own, branch: `feat/kept` })
		const throwaway = `${own}-round-1`
		createFakeNodeModules({ folder: join(throwaway, 'node_modules'), marker: `${NAME}-round-1` })
		writeKeepLine({ lotFolder })
		ageEverything({ workspace })

		await expect(
			runWorktreePrune({
				argv: ['--root', workspace.workspace, '--reclaim'],
				cwd: workspace.workspace,
				scratchRoot: temporaryFolder('dialecte-scratch-root-'),
				isTerminal: false,
				confirm: async function never() {
					return false
				},
				now: new Date(),
				listProcesses: function noProcess() {
					return []
				},
				spawner: createRecordingSpawner().spawner,
			}).then((result) => ({
				exitCode: result.exitCode,
				ownLine: result.output.split('\n').find((line) => line.includes(`.worktrees/${NAME} `)),
				ownNodeModules: existsSync(join(own, 'node_modules', MARKER_FILE))
					? readFileSync(join(own, 'node_modules', MARKER_FILE), 'utf8')
					: undefined,
				throwawayNodeModules: existsSync(join(throwaway, 'node_modules')),
			})),
		).resolves.toEqual({
			exitCode: 0,
			ownLine: expect.stringMatching(new RegExp(`^keep\\b.*${KEPT.replace(/[()]/g, '\\$&')}`)),
			ownNodeModules: NAME,
			throwawayNodeModules: false,
		})
	})
})

describe('health and a kept lot, read from a real store', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a committed kept lot whose worktree is idle more than a day → no idle finding for it', () => {
		const workspace = createBriefWorkspace()
		const lot = addLotWorktree({ workspace, name: NAME, state: 'committed' })
		writeKeepLine({ lotFolder: lot.lotFolder })
		const now = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)

		expect(
			findIdleWorktrees({
				repository: readHealthRepository({ common: join(workspace.repository, '.git') }),
				now,
			}),
		).toEqual([])
	})
})
