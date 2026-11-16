/**
 * `dialecte worktree prune --reclaim [--dry-run] [--older-than <days>]`: the flags, the dry run's lines and total, and
 * one real move each (a park, a trash) beside a worktree an open lot keeps. The decision per worktree is pinned by
 * `src/lib/worktree/reclaim-node-modules.test.ts`.
 */
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { MAIN_LOCK, OTHER_LOCK } from '../../test/reclaim-workspace.constants.ts'
import {
	addReclaimWorktree,
	ageEverything,
	createReclaimWorkspace,
} from '../../test/reclaim-workspace.ts'
import { temporaryFolder } from '../../test/scratch-repository.ts'
import { MARKER_FILE, POOL_COMMAND_CASE_MS } from '../../test/worktree-pool.constants.ts'
import {
	createFakeNodeModules,
	createRecordingSpawner,
	poolEntriesOf,
	readPoolFile,
	trashedNamesOf,
} from '../../test/worktree-pool.ts'
import { COMMAND_MAP } from '../lib/command-map/command-map.constants.ts'
import { computeLockKey } from '../lib/worktree/lock-key.ts'
import { runWorktreePrune } from './worktree.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BriefWorkspace } from '../../test/brief-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The worktree whose node_modules parks, and the one whose node_modules goes to the trash (names free of the action words). */
const PARKABLE = '0002-repo-alpha'
const TRASHABLE = '0003-repo-beta'
const ASKING = '0001-repo-asking'
/** An idle worktree with no node_modules: a line, never counted. */
const BARE = '0004-repo-gamma'

/** The help line of the command map naming the reclaim and its flags. */
const RECLAIM_USAGE = /^dialecte worktree prune .*--reclaim \[--dry-run\] \[--older-than <days>\]/

/** The total a dry run ends with: worktrees, files (and links), the size with its unit. */
const TOTAL_LINE = /^total: 2 worktrees, 14 files, \d+(\.\d+)? (B|kB|MB|GB)$/

/**
 * The three worktrees of a reclaim: one to park (the main checkout's lock), one to trash (another lock), one a working
 * lot names; each node_modules with its folder name as marker. Their real paths by name.
 */
function addThreeWorktrees(workspace: BriefWorkspace): Record<string, string> {
	return {
		[PARKABLE]: addReclaimWorktree({ workspace, name: PARKABLE, marker: PARKABLE }),
		[TRASHABLE]: addReclaimWorktree({
			workspace,
			name: TRASHABLE,
			lock: OTHER_LOCK,
			marker: TRASHABLE,
		}),
		[ASKING]: addReclaimWorktree({ workspace, name: ASKING, lot: 'working', marker: ASKING }),
	}
}

/** One idle worktree to park, the folder name `PARKABLE`; its real path. */
function addOneWorktree(workspace: BriefWorkspace): string {
	return addReclaimWorktree({ workspace, name: PARKABLE, marker: PARKABLE })
}

/** `worktree prune --root <workspace> --reclaim` and `flags`, no live process, the spawner only recording. */
function runReclaim(params: { workspace: BriefWorkspace; flags: string[] }) {
	return runPrune({ workspace: params.workspace, flags: ['--reclaim', ...params.flags] })
}

/** `worktree prune --root <workspace>` and `flags`, no live process, the spawner only recording. */
function runPrune(params: { workspace: BriefWorkspace; flags: string[] }) {
	return runWorktreePrune({
		argv: ['--root', params.workspace.workspace, ...params.flags],
		cwd: params.workspace.workspace,
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
	})
}

/** The line of the output naming the worktree folder `name`. */
function lineOf(params: { output: string; name: string }): string | undefined {
	return params.output.split('\n').find((line) => line.includes(params.name))
}

describe('worktree prune --reclaim: the command', { timeout: POOL_COMMAND_CASE_MS }, () => {
	it('the command map lists dialecte worktree prune --reclaim [--dry-run] [--older-than <days>]', () => {
		expect(COMMAND_MAP.worktree.usage.some((line) => RECLAIM_USAGE.test(line))).toBe(true)
	})

	it('--dry-run → a line per worktree (park, trash, keep with its lot, keep without node_modules), the total at the end counting only what moves, nothing moved', async () => {
		const workspace = createReclaimWorkspace()
		const worktrees = addThreeWorktrees(workspace)
		const bare = addReclaimWorktree({ workspace, name: BARE })
		rmSync(join(bare, 'node_modules'), { recursive: true, force: true })
		ageEverything({ workspace })
		const worktreesFolder = join(workspace.workspace, '.worktrees')

		const result = runReclaim({ workspace, flags: ['--dry-run'] })

		await expect(result).resolves.toMatchObject({ exitCode: 0 })
		const { output } = await result
		expect({
			parkable: lineOf({ output, name: PARKABLE }),
			trashable: lineOf({ output, name: TRASHABLE }),
			asking: lineOf({ output, name: ASKING }),
			bare: lineOf({ output, name: BARE }),
			total: output.split('\n').filter(Boolean).at(-1),
		}).toEqual({
			parkable: expect.stringMatching(/\bpark\b/),
			trashable: expect.stringMatching(/\btrash\b/),
			asking: expect.stringMatching(new RegExp(`\\bkeep\\b.*lot ${ASKING} working`)),
			bare: expect.stringMatching(/\bkeep\b.*no node_modules/),
			total: expect.stringMatching(TOTAL_LINE),
		})
		expect({
			nodeModules: Object.values(worktrees).map((worktree) =>
				existsSync(join(worktree, 'node_modules', MARKER_FILE)),
			),
			pool: poolEntriesOf(worktreesFolder),
			trash: trashedNamesOf(worktreesFolder),
		}).toEqual({ nodeModules: [true, true, true], pool: [], trash: [] })
	})

	it('without --dry-run → the parkable node_modules in the pool under the main checkout’s lock key, the trashable one in _trash/, the code of both stays, the lot’s worktree and the main checkout untouched', async () => {
		const workspace = createReclaimWorkspace()
		const worktrees = addThreeWorktrees(workspace)
		createFakeNodeModules({ folder: join(workspace.repository, 'node_modules'), marker: 'main' })
		ageEverything({ workspace })
		const worktreesFolder = join(workspace.workspace, '.worktrees')

		const result = runReclaim({ workspace, flags: [] })

		await expect(result).resolves.toMatchObject({ exitCode: 0 })
		const trashedMarkers = trashedNamesOf(worktreesFolder)
			.map((name) => join(worktreesFolder, '_trash', name, MARKER_FILE))
			.filter((path) => existsSync(path))
			.map((path) => readFileSync(path, 'utf8'))
		expect({
			pool: poolEntriesOf(worktreesFolder).map((name) => ({
				lockKey: readPoolFile({ worktreesFolder, name }).lockKey,
				marker: readFileSync(join(worktreesFolder, name, 'node_modules', MARKER_FILE), 'utf8'),
			})),
			trashedMarkers,
			main: readFileSync(join(workspace.repository, 'node_modules', MARKER_FILE), 'utf8'),
			nodeModulesLeft: Object.fromEntries(
				Object.entries(worktrees).map(([name, worktree]) => [
					name,
					existsSync(join(worktree, 'node_modules')),
				]),
			),
			code: [
				existsSync(join(worktrees[PARKABLE] ?? '', 'src/alpha.ts')),
				existsSync(join(worktrees[TRASHABLE] ?? '', 'src/beta.ts')),
			],
		}).toEqual({
			pool: [{ lockKey: computeLockKey({ text: MAIN_LOCK }), marker: PARKABLE }],
			trashedMarkers: [TRASHABLE],
			main: 'main',
			nodeModulesLeft: { [PARKABLE]: false, [TRASHABLE]: false, [ASKING]: true },
			code: [true, true],
		})
	})

	const KEPT_LINE = /\bkeep\b.*git activity after the cutoff/
	const PARKED_LINE = /\bpark\b/
	const CUTOFF_CASES = [
		{
			days: 1,
			flags: [],
			line: KEPT_LINE,
			outcome: 'kept, its line names the activity',
			title: 'activity a day ago, no --older-than (two days)',
		},
		{
			days: 3,
			flags: [],
			line: PARKED_LINE,
			outcome: 'parked',
			title: 'activity three days ago, no --older-than (two days)',
		},
		{
			days: 5,
			flags: ['--older-than', '7'],
			line: KEPT_LINE,
			outcome: 'kept, its line names the activity',
			title: 'activity five days ago, --older-than 7',
		},
		{
			days: 5,
			flags: ['--older-than', '4'],
			line: PARKED_LINE,
			outcome: 'parked',
			title: 'activity five days ago, --older-than 4',
		},
	]
	for (const testCase of CUTOFF_CASES)
		it(`${testCase.title} → ${testCase.outcome}`, async () => {
			const workspace = createReclaimWorkspace()
			addOneWorktree(workspace)
			ageEverything({ workspace, days: testCase.days })

			const result = runReclaim({ workspace, flags: ['--dry-run', ...testCase.flags] })

			await expect(result).resolves.toMatchObject({ exitCode: 0 })
			const { output } = await result
			expect(lineOf({ output, name: PARKABLE })).toMatch(testCase.line)
		})

	const BAD_OLDER_THAN = [
		{ title: 'no value', flags: ['--older-than'] },
		{ title: '0', flags: ['--older-than', '0'] },
		{ title: '-1', flags: ['--older-than', '-1'] },
		{ title: '1.5', flags: ['--older-than', '1.5'] },
		{ title: 'a word', flags: ['--older-than', 'soon'] },
	]
	for (const bad of BAD_OLDER_THAN)
		it(`--older-than ${bad.title} (not a positive whole number of days) → exit 2, the usage named, nothing moved`, async () => {
			const workspace = createReclaimWorkspace()
			const worktree = addOneWorktree(workspace)
			ageEverything({ workspace })

			await expect(runReclaim({ workspace, flags: bad.flags })).resolves.toMatchObject({
				exitCode: 2,
				output: expect.stringContaining('--older-than <days>'),
			})
			expect({
				nodeModules: existsSync(join(worktree, 'node_modules', MARKER_FILE)),
				pool: poolEntriesOf(join(workspace.workspace, '.worktrees')),
			}).toEqual({ nodeModules: true, pool: [] })
		})

	const WITHOUT_RECLAIM = [['--dry-run'], ['--older-than', '3']]
	for (const flags of WITHOUT_RECLAIM)
		it(`${flags.join(' ')} without --reclaim → exit 2, the usage names --reclaim, nothing moved`, async () => {
			const workspace = createReclaimWorkspace()
			const worktree = addOneWorktree(workspace)
			ageEverything({ workspace })

			await expect(runPrune({ workspace, flags })).resolves.toMatchObject({
				exitCode: 2,
				output: expect.stringContaining('--reclaim'),
			})
			expect(existsSync(join(worktree, 'node_modules', MARKER_FILE))).toBe(true)
		})
})
