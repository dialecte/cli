/**
 * `worktree prune --reclaim`, the decision per worktree (`planReclaim`) and the moves (`executeReclaim`). The invariant
 * (STATIONS.md): never move a worktree's `node_modules` (and never its code) unless it is proven not the main
 * checkout, not locked, named by no open lot and no open hand-over, worked in by no live process, reached by no link,
 * and without git activity (index, HEAD, reflog) after the cutoff; `executeReclaim` checks the keep rules again just
 * before each move. Every worktree of a case is idle for weeks (its git files aged) unless the case says otherwise, so
 * the one rule under test is the only thing that may keep it.
 */
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readlinkSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs'
import { basename, join } from 'node:path'

import { replaceRecord } from '../../../test/damaged-lot-workspace.ts'
import { linkLot } from '../../../test/lot-stores.ts'
import {
	DAY_MS,
	IDLE_DAYS,
	MAIN_LOCK,
	OTHER_LOCK,
} from '../../../test/reclaim-workspace.constants.ts'
import {
	addPlainWorktree,
	addPreservedFiles,
	addReclaimRepository,
	addReclaimWorktree,
	ageEverything,
	createReclaimWorkspace,
	gitFolderOf,
	preservedStateOf,
	touchGitFile,
} from '../../../test/reclaim-workspace.ts'
import { git, temporaryFolder } from '../../../test/scratch-repository.ts'
import { MARKER_FILE, POOL_COMMAND_CASE_MS } from '../../../test/worktree-pool.constants.ts'
import {
	createBareWorktreeFolder,
	createFakeNodeModules,
	createRecordingSpawner,
	poolEntriesOf,
	poolEntryOf,
	readPoolFile,
	readTree,
	trashedNamesOf,
	writePoolEntry,
} from '../../../test/worktree-pool.ts'
import {
	handoverStoreOf,
	recordHandoverState,
	registerHandover,
} from '../handover/handover-store.ts'
import { computeLockKey } from './lock-key.ts'
import { createPoolCache } from './node-modules-pool.ts'
import { executeReclaim, planReclaim } from './prune-worktrees.ts'
import {
	POOL_FILE,
	POOL_MISS_EMPTY,
	RECLAIM_GONE,
	RECLAIM_KEEP_REASONS,
} from './worktree.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BriefWorkspace } from '../../../test/brief-workspace.types.ts'
import type { LotKeepState } from '../../../test/lot-keep-workspace.types.ts'
import type {
	BackgroundSpawner,
	ProcessFolder,
	ReclaimItem,
	ReclaimOutcome,
	ReclaimPlan,
} from './worktree.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The cutoff of every case: git activity in the last two days keeps a worktree. */
const OLDER_THAN_DAYS = 2

/** The files and links of a fake node_modules (`createFakeNodeModules`, no marker): what a park or a trash moves. */
const FAKE_NODE_MODULES_FILES = 6

/** The pid of the process a case says works in a worktree. */
const LIVE_PID = 4242

const PARKABLE = '0002-repo-parkable'
const TRASHABLE = '0003-repo-trashable'
const ASKING = '0001-repo-asking'
const ROUND = `${ASKING}-round-1`

/** A reviewer's uncommitted edit in a review-round throwaway: the only copy of it. */
const REVIEWER_EDIT = 'review-edit.txt'
const REVIEWER_EDIT_TEXT = 'a reviewer wrote this and committed nothing\n'

/** The real paths of the worktrees git lists for the workspace's repository. */
function registeredWorktrees(workspace: BriefWorkspace): string[] {
	return git({ root: workspace.repository, args: ['worktree', 'list', '--porcelain'] })
		.split('\n')
		.filter((line) => line.startsWith('worktree '))
		.map((line) => line.slice('worktree '.length))
}

/** The activity reason of a keep line, whatever the file and the time it names. */
const ACTIVITY_REASON = /^git activity after the cutoff: /

/** The arguments of a plan of the workspace: now, the two-day cutoff, no live process unless `processes` says. */
function planArguments(params: {
	workspace: BriefWorkspace
	processes?: ProcessFolder[] | string
	scratchRoots?: string[]
}): Parameters<typeof planReclaim>[0] {
	return {
		workspace: params.workspace.workspace,
		now: new Date(),
		olderThanDays: OLDER_THAN_DAYS,
		listProcesses: function listed() {
			return params.processes ?? []
		},
		scratchRoots: params.scratchRoots ?? [],
	}
}

/** The arguments of the execution of `plan`: now, a spawner that only records, no live process unless `processes` says. */
function executeArguments(params: {
	workspace: BriefWorkspace
	plan: ReclaimPlan
	processes?: ProcessFolder[] | string
}): Parameters<typeof executeReclaim>[0] {
	return {
		plan: params.plan,
		workspace: params.workspace.workspace,
		now: new Date(),
		spawner: createRecordingSpawner().spawner,
		listProcesses: function listed() {
			return params.processes ?? []
		},
		scratchRoots: [],
	}
}

/** The item of the plan for the worktree folder `name`; undefined when the plan has none. */
function itemOf(params: { plan: ReclaimPlan; name: string }): ReclaimItem | undefined {
	return params.plan.items.find((item) => basename(item.worktree) === params.name)
}

/** The outcome of the worktree folder `name` among `outcomes`. */
function outcomeOf(params: {
	outcomes: ReclaimOutcome[]
	name: string
}): ReclaimOutcome | undefined {
	return params.outcomes.find((outcome) => basename(outcome.worktree) === params.name)
}

/** The marker of each pool entry of `worktreesFolder` that holds a `pool.json`, with its repository and lock key. */
function finishedEntriesOf(worktreesFolder: string) {
	return poolEntriesOf(worktreesFolder)
		.filter((name) => existsSync(join(worktreesFolder, name, POOL_FILE)))
		.map(function read(name) {
			const file = readPoolFile({ worktreesFolder, name })
			return {
				repository: file.repository,
				lockKey: file.lockKey,
				marker: readFileSync(join(worktreesFolder, name, 'node_modules', MARKER_FILE), 'utf8'),
			}
		})
}

/** The markers of the folders in `_trash/` that hold one. */
function trashedMarkersOf(worktreesFolder: string): string[] {
	return trashedNamesOf(worktreesFolder)
		.map((name) => join(worktreesFolder, '_trash', name, MARKER_FILE))
		.filter((path) => existsSync(path))
		.map((path) => readFileSync(path, 'utf8'))
}

describe('worktree prune --reclaim: the plan', { timeout: POOL_COMMAND_CASE_MS }, () => {
	it('an idle worktree no lot names, its lock key the main checkout’s and its node_modules passing its check → park, its node_modules counted (files and size)', () => {
		const workspace = createReclaimWorkspace()
		addReclaimWorktree({ workspace, name: PARKABLE })
		ageEverything({ workspace })

		expect(
			itemOf({ plan: planReclaim(planArguments({ workspace })), name: PARKABLE }),
		).toMatchObject({
			action: 'park',
			files: FAKE_NODE_MODULES_FILES,
			bytes: expect.any(Number),
		})
	})

	it('the cutoff is now minus --older-than days', () => {
		const workspace = createReclaimWorkspace()
		const now = new Date('2026-11-16T12:00:00.000Z')

		expect(planReclaim({ ...planArguments({ workspace }), now, olderThanDays: 5 }).cutoff).toEqual(
			new Date('2026-11-11T12:00:00.000Z'),
		)
	})

	it('an idle worktree whose lock key is not the main checkout’s (its check passes) → trash', () => {
		const workspace = createReclaimWorkspace()
		addReclaimWorktree({ workspace, name: TRASHABLE, lock: OTHER_LOCK })
		ageEverything({ workspace })

		expect(
			itemOf({ plan: planReclaim(planArguments({ workspace })), name: TRASHABLE })?.action,
		).toBe('trash')
	})

	it('an idle worktree with the main checkout’s lock key whose node_modules fails its check (demo 2.0.0 installed) → trash, the reason names the package', () => {
		const workspace = createReclaimWorkspace()
		const worktree = addReclaimWorktree({ workspace, name: '0004-repo-drifted' })
		writeFileSync(
			join(worktree, 'node_modules/demo/package.json'),
			'{ "name": "demo", "version": "2.0.0" }\n',
		)
		ageEverything({ workspace })

		expect(
			itemOf({ plan: planReclaim(planArguments({ workspace })), name: '0004-repo-drifted' }),
		).toMatchObject({ action: 'trash', reason: expect.stringContaining('demo') })
	})

	const OPEN_STATES: LotKeepState[] = ['working', 'input-required', 'ready', 'failed']
	for (const state of OPEN_STATES)
		it(`a worktree a lot ${state} names, idle for weeks → keep, its line says lot <name> ${state}`, () => {
			const workspace = createReclaimWorkspace()
			addReclaimWorktree({ workspace, name: ASKING, lot: state })
			ageEverything({ workspace })

			expect(
				itemOf({ plan: planReclaim(planArguments({ workspace })), name: ASKING }),
			).toMatchObject({ action: 'keep', reason: expect.stringContaining(`lot ${ASKING} ${state}`) })
		})

	it('a worktree a live process works in (below its root), idle for weeks → keep, its line names the pid', () => {
		const workspace = createReclaimWorkspace()
		const worktree = addReclaimWorktree({ workspace, name: PARKABLE })
		ageEverything({ workspace })
		const processes = [{ pid: LIVE_PID, folder: join(worktree, 'src') }]

		expect(
			itemOf({ plan: planReclaim(planArguments({ workspace, processes })), name: PARKABLE }),
		).toMatchObject({
			action: 'keep',
			reason: RECLAIM_KEEP_REASONS.process.replace('{pid}', String(LIVE_PID)),
		})
	})

	it('the processes cannot be listed → every worktree kept, its line says why', () => {
		const workspace = createReclaimWorkspace()
		addReclaimWorktree({ workspace, name: PARKABLE })
		ageEverything({ workspace })
		const processes = 'lsof cannot run (spawn lsof ENOENT): the processes are not known'

		expect(
			itemOf({ plan: planReclaim(planArguments({ workspace, processes })), name: PARKABLE }),
		).toMatchObject({ action: 'keep', reason: processes })
	})

	it('the main checkout, idle for weeks, its node_modules installing its own lock → keep, its line says the main checkout', () => {
		const workspace = createReclaimWorkspace()
		createFakeNodeModules({ folder: join(workspace.repository, 'node_modules') })
		ageEverything({ workspace })

		expect(
			itemOf({
				plan: planReclaim(planArguments({ workspace })),
				name: basename(workspace.repository),
			}),
		).toMatchObject({ action: 'keep', reason: RECLAIM_KEEP_REASONS.main })
	})

	it('a locked worktree (git worktree lock), idle for weeks → keep, its line says locked', () => {
		const workspace = createReclaimWorkspace()
		const worktree = addReclaimWorktree({ workspace, name: PARKABLE })
		git({ root: workspace.repository, args: ['worktree', 'lock', worktree] })
		ageEverything({ workspace })

		expect(
			itemOf({ plan: planReclaim(planArguments({ workspace })), name: PARKABLE }),
		).toMatchObject({ action: 'keep', reason: RECLAIM_KEEP_REASONS.locked })
	})

	const LINK_CASES = [
		{
			title: 'a link at the workspace root to the worktree',
			place: function placeLink(params: { workspace: BriefWorkspace; worktree: string }) {
				const link = join(params.workspace.workspace, 'alias')
				symlinkSync(params.worktree, link)
				return { link, scratchRoots: [] }
			},
		},
		{
			title: 'a link in _commit-plan/ to the worktree’s src/',
			place: function placeLink(params: { workspace: BriefWorkspace; worktree: string }) {
				const link = join(params.workspace.workspace, '_commit-plan', 'sources')
				symlinkSync(join(params.worktree, 'src'), link)
				return { link, scratchRoots: [] }
			},
		},
		{
			title: 'a link in a scratch root to the worktree',
			place: function placeLink(params: { workspace: BriefWorkspace; worktree: string }) {
				const scratchRoot = realpathSync(temporaryFolder('dialecte-reclaim-scratch-'))
				const link = join(scratchRoot, 'rehearsal-checkout')
				symlinkSync(params.worktree, link)
				return { link, scratchRoots: [scratchRoot] }
			},
		},
	]
	for (const linkCase of LINK_CASES)
		it(`${linkCase.title}, idle for weeks → keep, its line names the link`, () => {
			const workspace = createReclaimWorkspace()
			const worktree = addReclaimWorktree({ workspace, name: PARKABLE })
			const { link, scratchRoots } = linkCase.place({ workspace, worktree })
			ageEverything({ workspace })

			expect(
				itemOf({
					plan: planReclaim(planArguments({ workspace, scratchRoots })),
					name: PARKABLE,
				}),
			).toMatchObject({ action: 'keep', reason: RECLAIM_KEEP_REASONS.link.replace('{link}', link) })
		})

	it('a worktree an open hand-over entry of the registry names, idle for weeks → keep, its line names the hand-over', () => {
		const workspace = createReclaimWorkspace()
		const worktree = addReclaimWorktree({ workspace, name: PARKABLE })
		const handover = registerHandover({
			root: worktree,
			folder: realpathSync(temporaryFolder('dialecte-handover-')),
			branch: 'feat/parkable',
			now: new Date(Date.now() - IDLE_DAYS * DAY_MS),
		})
		ageEverything({ workspace })

		expect(
			itemOf({ plan: planReclaim(planArguments({ workspace })), name: PARKABLE }),
		).toMatchObject({
			action: 'keep',
			reason: RECLAIM_KEEP_REASONS.handover
				.replace('{name}', handover)
				.replace('{state}', 'pending'),
		})
	})

	it('a worktree a committed hand-over entry names, idle for weeks → park: a closed hand-over keeps nothing', () => {
		const workspace = createReclaimWorkspace()
		const worktree = addReclaimWorktree({ workspace, name: PARKABLE })
		const folder = realpathSync(temporaryFolder('dialecte-handover-'))
		registerHandover({
			root: worktree,
			folder,
			branch: 'feat/parkable',
			now: new Date(Date.now() - IDLE_DAYS * DAY_MS),
		})
		recordHandoverState({ store: handoverStoreOf(worktree), folder, state: 'committed' })
		ageEverything({ workspace })

		expect(
			itemOf({ plan: planReclaim(planArguments({ workspace })), name: PARKABLE })?.action,
		).toBe('park')
	})

	const ACTIVITY_FILES = ['index', 'HEAD', 'logs/HEAD'] as const
	for (const file of ACTIVITY_FILES)
		it(`a worktree whose ${file} was written a day ago (cutoff two days) → keep, its line names the activity`, () => {
			const workspace = createReclaimWorkspace()
			const worktree = addReclaimWorktree({ workspace, name: PARKABLE })
			ageEverything({ workspace })
			touchGitFile({ gitFolder: gitFolderOf(worktree), file, days: 1 })

			expect(
				itemOf({ plan: planReclaim(planArguments({ workspace })), name: PARKABLE }),
			).toMatchObject({
				action: 'keep',
				reason: expect.stringMatching(
					new RegExp(`^git activity after the cutoff: \\S*${file.replace('/', '\\/')} at `),
				),
			})
		})

	const OTHER_ACTIVITY = [
		{
			title: 'only the main checkout’s .git/index',
			gitFolder: (workspace: BriefWorkspace) => join(workspace.repository, '.git'),
		},
		{
			title: 'only another worktree’s index',
			gitFolder: (workspace: BriefWorkspace) =>
				gitFolderOf(join(workspace.workspace, '.worktrees', ASKING)),
		},
	]
	for (const activityCase of OTHER_ACTIVITY)
		it(`${activityCase.title} written a day ago → the idle worktree still parks`, () => {
			const workspace = createReclaimWorkspace()
			addReclaimWorktree({ workspace, name: PARKABLE })
			addReclaimWorktree({ workspace, name: ASKING })
			ageEverything({ workspace })
			touchGitFile({ gitFolder: activityCase.gitFolder(workspace), file: 'index', days: 1 })

			expect(
				itemOf({ plan: planReclaim(planArguments({ workspace })), name: PARKABLE })?.action,
			).toBe('park')
		})

	it('an idle worktree whose node_modules is a symbolic link → keep, its line says so', () => {
		const workspace = createReclaimWorkspace()
		const worktree = addReclaimWorktree({ workspace, name: PARKABLE })
		const target = join(realpathSync(temporaryFolder('dialecte-linked-modules-')), 'node_modules')
		rmSync(join(worktree, 'node_modules'), { recursive: true, force: true })
		createFakeNodeModules({ folder: target })
		symlinkSync(target, join(worktree, 'node_modules'))
		ageEverything({ workspace })

		expect(
			itemOf({ plan: planReclaim(planArguments({ workspace })), name: PARKABLE }),
		).toMatchObject({ action: 'keep', reason: RECLAIM_KEEP_REASONS.nodeModulesLink })
	})

	it('an idle worktree with no node_modules → keep, its line says so, nothing counted', () => {
		const workspace = createReclaimWorkspace()
		const worktree = addReclaimWorktree({ workspace, name: PARKABLE })
		rmSync(join(worktree, 'node_modules'), { recursive: true, force: true })
		ageEverything({ workspace })

		expect(
			itemOf({ plan: planReclaim(planArguments({ workspace })), name: PARKABLE }),
		).toMatchObject({
			action: 'keep',
			reason: RECLAIM_KEEP_REASONS.noNodeModules,
			files: 0,
			bytes: 0,
		})
	})
})

describe(
	'worktree prune --reclaim: the -round-<n> throwaways',
	{ timeout: POOL_COMMAND_CASE_MS },
	() => {
		const CLOSED_STATES: LotKeepState[] = ['committed', 'canceled']
		for (const state of CLOSED_STATES)
			it(`an idle review-round throwaway of a lot ${state} holding a reviewer's edit → its node_modules parked; the worktree, the edit and its registration untouched`, () => {
				const workspace = createReclaimWorkspace()
				addReclaimWorktree({ workspace, name: ASKING, lot: state })
				const round = addReclaimWorktree({ workspace, name: ROUND, merged: false })
				writeFileSync(join(round, REVIEWER_EDIT), REVIEWER_EDIT_TEXT)
				ageEverything({ workspace })

				expect(
					itemOf({ plan: planReclaim(planArguments({ workspace })), name: ROUND })?.action,
				).toBe('park')
				executeReclaim(
					executeArguments({ workspace, plan: planReclaim(planArguments({ workspace })) }),
				)
				expect({
					edit: readFileSync(join(round, REVIEWER_EDIT), 'utf8'),
					code: existsSync(join(round, 'src/asking-round-1.ts')),
					registered: registeredWorktrees(workspace).includes(round),
					nodeModules: existsSync(join(round, 'node_modules')),
				}).toEqual({ edit: REVIEWER_EDIT_TEXT, code: true, registered: true, nodeModules: false })
			})

		const OPEN_ROUND_STATES: LotKeepState[] = ['working', 'failed']
		for (const state of OPEN_ROUND_STATES)
			it(`an idle review-round throwaway of a lot ${state} → reclaimed like any idle worktree: its node_modules parked, never kept for the round alone`, () => {
				const workspace = createReclaimWorkspace()
				addReclaimWorktree({ workspace, name: ASKING, lot: state })
				addReclaimWorktree({ workspace, name: ROUND, merged: false })
				ageEverything({ workspace })

				expect(
					itemOf({ plan: planReclaim(planArguments({ workspace })), name: ROUND })?.action,
				).toBe('park')
			})

		const GUARDED_ROUNDS = [
			{
				title: 'locked',
				arrange: function lock(params: { workspace: BriefWorkspace; round: string }) {
					git({ root: params.workspace.repository, args: ['worktree', 'lock', params.round] })
					ageEverything({ workspace: params.workspace })
					return { processes: [], reason: RECLAIM_KEEP_REASONS.locked }
				},
			},
			{
				title: 'worked in by a live process',
				arrange: function work(params: { workspace: BriefWorkspace; round: string }) {
					ageEverything({ workspace: params.workspace })
					return {
						processes: [{ pid: LIVE_PID, folder: params.round }],
						reason: RECLAIM_KEEP_REASONS.process.replace('{pid}', String(LIVE_PID)),
					}
				},
			},
			{
				title: 'active a day ago',
				arrange: function touch(params: { workspace: BriefWorkspace; round: string }) {
					ageEverything({ workspace: params.workspace })
					touchGitFile({ gitFolder: gitFolderOf(params.round), file: 'index', days: 1 })
					return { processes: [], reason: expect.stringMatching(ACTIVITY_REASON) }
				},
			},
			{
				title: 'reached through a link',
				arrange: function link(params: { workspace: BriefWorkspace; round: string }) {
					const alias = join(params.workspace.workspace, 'round-alias')
					symlinkSync(params.round, alias)
					ageEverything({ workspace: params.workspace })
					return { processes: [], reason: RECLAIM_KEEP_REASONS.link.replace('{link}', alias) }
				},
			},
		]
		for (const guarded of GUARDED_ROUNDS)
			it(`a review-round throwaway of a committed lot, ${guarded.title} → keep with its reason; still there after the execution`, () => {
				const workspace = createReclaimWorkspace()
				addReclaimWorktree({ workspace, name: ASKING, lot: 'committed' })
				const round = addReclaimWorktree({ workspace, name: ROUND, merged: false })
				const { processes, reason } = guarded.arrange({ workspace, round })

				expect(
					itemOf({ plan: planReclaim(planArguments({ workspace, processes })), name: ROUND }),
				).toMatchObject({ action: 'keep', reason })
				executeReclaim(
					executeArguments({
						workspace,
						plan: planReclaim(planArguments({ workspace, processes })),
						processes,
					}),
				)
				expect({
					round: existsSync(join(round, 'src/asking-round-1.ts')),
					nodeModules: existsSync(join(round, 'node_modules')),
				}).toEqual({ round: true, nodeModules: true })
			})
	},
)

describe(
	'worktree prune --reclaim: a lot whose identity does not read',
	{ timeout: POOL_COMMAND_CASE_MS },
	() => {
		/** The lot `ASKING` with its idle worktree, its `identity.json` made unparsable, its root link to its folder. */
		function unreadableLot(workspace: BriefWorkspace): void {
			const worktree = addReclaimWorktree({ workspace, name: ASKING, lot: 'working' })
			const lotFolder = realpathSync(join(workspace.store, ASKING))
			replaceRecord({ folder: lotFolder, name: 'identity.json', text: '{ "schema": 1, ' })
			linkLot({ worktree, lotFolder })
		}

		it('its worktree, found by its root link, idle for weeks → keep, its line says lot <name> damaged', () => {
			const workspace = createReclaimWorkspace()
			unreadableLot(workspace)
			ageEverything({ workspace })

			expect(
				itemOf({ plan: planReclaim(planArguments({ workspace })), name: ASKING }),
			).toMatchObject({ action: 'keep', reason: `lot ${ASKING} damaged` })
		})

		it('its idle review-round throwaway → still reclaimed: its node_modules parked', () => {
			// guard: reclaim asks no throwaway expansion, so an unreadable lot's round is reclaimed like an open lot's
			const workspace = createReclaimWorkspace()
			unreadableLot(workspace)
			addReclaimWorktree({ workspace, name: ROUND, merged: false })
			ageEverything({ workspace })

			expect(itemOf({ plan: planReclaim(planArguments({ workspace })), name: ROUND })?.action).toBe(
				'park',
			)
		})
	},
)

describe(
	'worktree prune --reclaim: a park left half done',
	{ timeout: POOL_COMMAND_CASE_MS },
	() => {
		/** `_pool-repo-1/node_modules` with the main lock's packages and no `pool.json`: a park interrupted after the rename. */
		function addHalfEntry(worktreesFolder: string): string {
			const half = join(worktreesFolder, '_pool-repo-1')
			mkdirSync(half, { recursive: true })
			createFakeNodeModules({ folder: join(half, 'node_modules'), marker: 'half' })
			return half
		}

		it('the cache’s list leaves the half entry out', () => {
			const workspace = createReclaimWorkspace()
			const worktreesFolder = join(workspace.workspace, '.worktrees')
			addHalfEntry(worktreesFolder)

			expect(createPoolCache({ repository: workspace.repository, worktreesFolder }).list()).toEqual(
				[],
			)
		})

		it('a restore with the main lock → miss: pool empty, the half entry left where it is', () => {
			const workspace = createReclaimWorkspace()
			const worktreesFolder = join(workspace.workspace, '.worktrees')
			const half = addHalfEntry(worktreesFolder)
			const checkout = createBareWorktreeFolder({
				worktreesFolder,
				name: '0009-repo-new',
				lock: MAIN_LOCK,
			})

			expect({
				restore: createPoolCache({ repository: workspace.repository, worktreesFolder }).restore({
					checkout,
					lockText: MAIN_LOCK,
				}),
				half: existsSync(join(half, 'node_modules', MARKER_FILE)),
			}).toEqual({ restore: { miss: POOL_MISS_EMPTY }, half: true })
		})

		it('a reclaim parking an idle worktree → a new entry of its own; the half folder is no entry and stays as it is', () => {
			const workspace = createReclaimWorkspace()
			const worktreesFolder = join(workspace.workspace, '.worktrees')
			const half = addHalfEntry(worktreesFolder)
			addReclaimWorktree({ workspace, name: PARKABLE, marker: PARKABLE })
			ageEverything({ workspace })

			expect(function reclaim() {
				executeReclaim(
					executeArguments({ workspace, plan: planReclaim(planArguments({ workspace })) }),
				)
			}).not.toThrow()
			expect({
				entries: finishedEntriesOf(worktreesFolder),
				half: {
					marker: readFileSync(join(half, 'node_modules', MARKER_FILE), 'utf8'),
					poolFile: existsSync(join(half, POOL_FILE)),
				},
			}).toEqual({
				entries: [
					{ repository: 'repo', lockKey: computeLockKey({ text: MAIN_LOCK }), marker: PARKABLE },
				],
				half: { marker: 'half', poolFile: false },
			})
		})
	},
)

describe('worktree prune --reclaim: two repositories', { timeout: POOL_COMMAND_CASE_MS }, () => {
	it('repo (main lock A) and other (main lock B), one idle worktree each with its own main lock, and one of other with lock A → two entries, each of its repository and key; the other with lock A trashed', () => {
		const workspace = createReclaimWorkspace()
		const other = addReclaimRepository({ workspace, folder: 'other', lock: OTHER_LOCK })
		addReclaimWorktree({ workspace, name: PARKABLE, marker: 'repo-parked' })
		addPlainWorktree({
			workspace,
			repository: other,
			name: '0001-other-parked',
			marker: 'other-parked',
		})
		addPlainWorktree({
			workspace,
			repository: other,
			name: '0002-other-lock-a',
			marker: 'other-lock-a',
			lock: MAIN_LOCK,
		})
		ageEverything({ workspace })
		const worktreesFolder = join(workspace.workspace, '.worktrees')

		expect(function reclaim() {
			executeReclaim(
				executeArguments({ workspace, plan: planReclaim(planArguments({ workspace })) }),
			)
		}).not.toThrow()
		expect({
			entries: finishedEntriesOf(worktreesFolder).sort((left, right) =>
				left.marker.localeCompare(right.marker),
			),
			trashed: trashedMarkersOf(worktreesFolder),
		}).toEqual({
			entries: [
				{
					repository: 'other',
					lockKey: computeLockKey({ text: OTHER_LOCK }),
					marker: 'other-parked',
				},
				{ repository: 'repo', lockKey: computeLockKey({ text: MAIN_LOCK }), marker: 'repo-parked' },
			],
			trashed: ['other-lock-a'],
		})
	})
})

describe('worktree prune --reclaim: the execution', { timeout: POOL_COMMAND_CASE_MS }, () => {
	it('a park and a trash leave every other file of their worktrees byte for byte, git status unchanged; a symlinked node_modules and its target untouched', () => {
		const workspace = createReclaimWorkspace()
		const parkable = addReclaimWorktree({ workspace, name: PARKABLE })
		const trashable = addReclaimWorktree({ workspace, name: TRASHABLE, lock: OTHER_LOCK })
		const linked = addReclaimWorktree({ workspace, name: '0004-repo-linked' })
		const target = join(realpathSync(temporaryFolder('dialecte-linked-modules-')), 'node_modules')
		rmSync(join(linked, 'node_modules'), { recursive: true, force: true })
		createFakeNodeModules({ folder: target, marker: 'linked' })
		symlinkSync(target, join(linked, 'node_modules'))
		for (const worktree of [parkable, trashable]) addPreservedFiles(worktree)
		// read before the ageing: git status may refresh an index, which is git activity
		const before = {
			parkable: preservedStateOf(parkable),
			trashable: preservedStateOf(trashable),
			target: readTree(target),
			link: readlinkSync(join(linked, 'node_modules')),
		}
		ageEverything({ workspace })
		let outcomes: ReclaimOutcome[] = []

		expect(function reclaim() {
			outcomes = executeReclaim(
				executeArguments({ workspace, plan: planReclaim(planArguments({ workspace })) }),
			)
		}).not.toThrow()
		expect({
			moved: [PARKABLE, TRASHABLE].map((name) => outcomeOf({ outcomes, name })?.moved),
			parkable: preservedStateOf(parkable),
			trashable: preservedStateOf(trashable),
			target: readTree(target),
			link: readlinkSync(join(linked, 'node_modules')),
		}).toEqual({ moved: [true, true], ...before })
	})

	it('two plans of the same idle worktree, both made before either moves → the first parks it, the second finds it gone: its line, no throw', () => {
		const workspace = createReclaimWorkspace()
		const worktree = addReclaimWorktree({ workspace, name: PARKABLE })
		ageEverything({ workspace })
		const worktreesFolder = join(workspace.workspace, '.worktrees')
		let outcomes: ReclaimOutcome[][] = []

		expect(function reclaimTwiceAtOnce() {
			const plans = [
				planReclaim(planArguments({ workspace })),
				planReclaim(planArguments({ workspace })),
			]
			outcomes = plans.map((plan) => executeReclaim(executeArguments({ workspace, plan })))
		}).not.toThrow()
		expect({
			first: outcomeOf({ outcomes: outcomes[0] ?? [], name: PARKABLE })?.moved,
			second: outcomeOf({ outcomes: outcomes[1] ?? [], name: PARKABLE }),
			pool: poolEntriesOf(worktreesFolder),
			code: existsSync(join(worktree, 'src/parkable.ts')),
		}).toEqual({
			first: true,
			second: {
				worktree: expect.any(String),
				moved: false,
				line: expect.stringContaining(RECLAIM_GONE),
			},
			pool: ['_pool-repo-1'],
			code: true,
		})
	})

	it('a trash item whose node_modules is removed between the plan and the move → not moved, its line says gone, no throw', () => {
		const workspace = createReclaimWorkspace()
		const worktree = addReclaimWorktree({ workspace, name: TRASHABLE, lock: OTHER_LOCK })
		ageEverything({ workspace })
		let outcomes: ReclaimOutcome[] = []

		expect(function reclaim() {
			const plan = planReclaim(planArguments({ workspace }))
			rmSync(join(worktree, 'node_modules'), { recursive: true, force: true })
			outcomes = executeReclaim(executeArguments({ workspace, plan }))
		}).not.toThrow()
		expect(outcomeOf({ outcomes, name: TRASHABLE })).toEqual({
			worktree: expect.any(String),
			moved: false,
			line: expect.stringContaining(RECLAIM_GONE),
		})
	})

	it('a park whose eviction finds its entry removed by another park (ENOENT) → no throw: already evicted, the park says parked, the trash item after it still moved', () => {
		const workspace = createReclaimWorkspace()
		addReclaimWorktree({ workspace, name: PARKABLE })
		addReclaimWorktree({ workspace, name: TRASHABLE, lock: OTHER_LOCK })
		ageEverything({ workspace })
		const worktreesFolder = join(workspace.workspace, '.worktrees')
		// an old-shape entry (trashed first), then two of the main lock key: the park's third evicts _pool-repo-2
		const oldShape = writePoolEntry({
			worktreesFolder,
			name: '_pool-repo-1',
			entry: poolEntryOf({
				repository: 'repo',
				lock: MAIN_LOCK,
				parkedAt: '2026-11-01T09:00:00.000Z',
			}),
		})
		writeFileSync(
			join(oldShape, POOL_FILE),
			`${JSON.stringify({ repository: 'repo', lockHash: computeLockKey({ text: MAIN_LOCK }), parkedAt: '2026-11-01T09:00:00.000Z' })}\n`,
		)
		for (const [name, parkedAt] of [
			['_pool-repo-2', '2026-11-02T09:00:00.000Z'],
			['_pool-repo-3', '2026-11-03T09:00:00.000Z'],
		])
			writePoolEntry({
				worktreesFolder,
				name,
				entry: poolEntryOf({ repository: 'repo', lock: MAIN_LOCK, parkedAt }),
			})
		const evicted = join(worktreesFolder, '_pool-repo-2')
		// another park removes the entry the eviction picked, while the old-shape one goes to the trash
		function spawner(params: Parameters<BackgroundSpawner>[0]): void {
			if (basename(params.args.at(-1) ?? '').startsWith('_pool-repo-1-'))
				rmSync(evicted, { recursive: true, force: true })
		}
		const plan = planReclaim(planArguments({ workspace }))
		const ordered = {
			...plan,
			items: [PARKABLE, TRASHABLE].flatMap((name) => itemOf({ plan, name }) ?? []),
		}
		let outcomes: ReclaimOutcome[] = []

		expect(function reclaim() {
			outcomes = executeReclaim({ ...executeArguments({ workspace, plan: ordered }), spawner })
		}).not.toThrow()
		expect({
			parkable: outcomeOf({ outcomes, name: PARKABLE }),
			trashable: outcomeOf({ outcomes, name: TRASHABLE })?.moved,
		}).toEqual({
			parkable: {
				worktree: expect.any(String),
				moved: true,
				line: expect.stringMatching(/^parked {2}/),
			},
			trashable: true,
		})
	})

	it('a park whose eviction throws after the entry is whole (the removal cannot start) → no throw: parked, the eviction problem a note on its line', () => {
		const workspace = createReclaimWorkspace()
		const worktree = addReclaimWorktree({ workspace, name: PARKABLE })
		ageEverything({ workspace })
		const worktreesFolder = join(workspace.workspace, '.worktrees')
		const oldShape = writePoolEntry({
			worktreesFolder,
			name: '_pool-repo-1',
			entry: poolEntryOf({
				repository: 'repo',
				lock: MAIN_LOCK,
				parkedAt: '2026-11-01T09:00:00.000Z',
			}),
		})
		writeFileSync(
			join(oldShape, POOL_FILE),
			`${JSON.stringify({ repository: 'repo', lockHash: computeLockKey({ text: MAIN_LOCK }), parkedAt: '2026-11-01T09:00:00.000Z' })}\n`,
		)
		function spawner(params: Parameters<BackgroundSpawner>[0]): void {
			if (basename(params.args.at(-1) ?? '').startsWith('_pool-repo-1-'))
				throw new Error('spawn rm EAGAIN')
		}
		const plan = planReclaim(planArguments({ workspace }))
		let outcomes: ReclaimOutcome[] = []

		expect(function reclaim() {
			outcomes = executeReclaim({ ...executeArguments({ workspace, plan }), spawner })
		}).not.toThrow()
		expect({
			outcome: outcomeOf({ outcomes, name: PARKABLE }),
			nodeModules: existsSync(join(worktree, 'node_modules')),
		}).toEqual({
			outcome: {
				worktree: expect.any(String),
				moved: true,
				line: expect.stringMatching(
					/^parked {2}.*node_modules -> \.worktrees\/_pool-repo-\d+.*EAGAIN/,
				),
			},
			nodeModules: false,
		})
	})

	it("a park, a trash and a review throwaway's park in one execution → the processes listed once for the whole execution, not once per item", () => {
		const workspace = createReclaimWorkspace()
		addReclaimWorktree({ workspace, name: PARKABLE })
		addReclaimWorktree({ workspace, name: TRASHABLE, lock: OTHER_LOCK })
		addReclaimWorktree({ workspace, name: ASKING, lot: 'committed' })
		addReclaimWorktree({ workspace, name: ROUND, merged: false })
		ageEverything({ workspace })
		const plan = planReclaim(planArguments({ workspace }))
		expect(itemOf({ plan, name: ROUND })?.action).toBe('park')
		let listings = 0
		function countingLister(): ProcessFolder[] {
			listings++
			return []
		}
		let outcomes: ReclaimOutcome[] = []

		expect(function reclaim() {
			outcomes = executeReclaim({
				...executeArguments({ workspace, plan }),
				listProcesses: countingLister,
			})
		}).not.toThrow()
		expect({
			moved: [PARKABLE, TRASHABLE, ROUND].map((name) => outcomeOf({ outcomes, name })?.moved),
			listings,
		}).toEqual({ moved: [true, true, true], listings: 1 })
	})

	it('two review-round throwaways of committed lots in one execution → both keep their code and stay registered, only their node_modules moved', () => {
		const workspace = createReclaimWorkspace()
		const otherLot = '0005-repo-other'
		const otherRound = `${otherLot}-round-1`
		addReclaimWorktree({ workspace, name: ASKING, lot: 'committed' })
		addReclaimWorktree({ workspace, name: ROUND, merged: false })
		addReclaimWorktree({ workspace, name: otherLot, lot: 'committed' })
		addReclaimWorktree({ workspace, name: otherRound, merged: false })
		ageEverything({ workspace })
		const rounds = [ROUND, otherRound].map((name) =>
			realpathSync(join(workspace.workspace, '.worktrees', name)),
		)
		let outcomes: ReclaimOutcome[] = []

		expect(function reclaim() {
			outcomes = executeReclaim(
				executeArguments({ workspace, plan: planReclaim(planArguments({ workspace })) }),
			)
		}).not.toThrow()
		expect({
			moved: [ROUND, otherRound].map((name) => outcomeOf({ outcomes, name })?.moved),
			code: rounds.map((round) => existsSync(join(round, 'src'))),
			registered: rounds.map((round) => registeredWorktrees(workspace).includes(round)),
		}).toEqual({ moved: [true, true], code: [true, true], registered: [true, true] })
	})

	const CHANGED_AFTER_PLAN = [
		{
			title: 'locked',
			change: function lock(params: { workspace: BriefWorkspace; worktree: string }) {
				git({ root: params.workspace.repository, args: ['worktree', 'lock', params.worktree] })
			},
			line: expect.stringContaining(RECLAIM_KEEP_REASONS.locked),
		},
		{
			title: 'given a fresh index',
			change: function touch(params: { workspace: BriefWorkspace; worktree: string }) {
				touchGitFile({ gitFolder: gitFolderOf(params.worktree), file: 'index', days: 0 })
			},
			line: expect.stringMatching(/git activity after the cutoff: /),
		},
	]
	for (const changed of CHANGED_AFTER_PLAN)
		it(`an idle worktree ${changed.title} between the plan and the move → kept at the move, its line says why, its node_modules in place`, () => {
			const workspace = createReclaimWorkspace()
			const worktree = addReclaimWorktree({ workspace, name: PARKABLE })
			ageEverything({ workspace })
			let outcomes: ReclaimOutcome[] = []

			expect(function reclaim() {
				const plan = planReclaim(planArguments({ workspace }))
				changed.change({ workspace, worktree })
				outcomes = executeReclaim(executeArguments({ workspace, plan }))
			}).not.toThrow()
			expect({
				outcome: outcomeOf({ outcomes, name: PARKABLE }),
				nodeModules: existsSync(join(worktree, 'node_modules')),
			}).toEqual({
				outcome: { worktree: expect.any(String), moved: false, line: changed.line },
				nodeModules: true,
			})
		})
})
