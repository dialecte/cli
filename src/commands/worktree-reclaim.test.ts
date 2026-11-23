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
import { reclaimTotalLine } from '../lib/worktree/prune-worktrees.ts'
import { runWorktreePrune } from './worktree.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BriefWorkspace } from '../../test/brief-workspace.types.ts'
import type { ProcessFolder } from '../lib/worktree/worktree.types.ts'

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

/** What the process lister throws in the cases where the processes cannot be listed. */
const LISTER_FAILURE = 'the process list cannot be read'
/** The keep reason of a worktree whose processes are not known because the lister threw. */
const NOT_KNOWN = `the processes are not known (${LISTER_FAILURE}): nothing is moved`
/** The pid of the process the lister reports working in a worktree (this test's own: alive). */
const WORKING_PID = process.pid

/** A process lister that throws `LISTER_FAILURE`. */
function throwingLister(): ProcessFolder[] {
	throw new Error(LISTER_FAILURE)
}

/**
 * A process lister for the plan and the execution: no process on its first call (the plan's one read), `then` from its
 * second (the execution's one read, at its first move). A reclaim has no confirmation to switch it inside: the plan
 * reads the processes once and the execution once, so the call order is the contract, not an incidental count.
 */
function planThenMoveLister(then: () => ProcessFolder[] | string): () => ProcessFolder[] | string {
	let read = false
	return function listProcesses() {
		if (!read) {
			read = true
			return []
		}
		return then()
	}
}

/** `worktree prune --root <workspace> --reclaim` and `flags` with `listProcesses`; the result and the spawns recorded. */
function runReclaimListing(params: {
	workspace: BriefWorkspace
	flags: string[]
	listProcesses: () => ProcessFolder[] | string
}) {
	const recording = createRecordingSpawner()
	const result = runWorktreePrune({
		argv: ['--root', params.workspace.workspace, '--reclaim', ...params.flags],
		cwd: params.workspace.workspace,
		scratchRoot: temporaryFolder('dialecte-scratch-root-'),
		isTerminal: false,
		confirm: async function never() {
			return false
		},
		now: new Date(),
		listProcesses: params.listProcesses,
		spawner: recording.spawner,
	})
	return { result, spawns: recording.calls }
}

/** What a reclaim left of one worktree's node_modules: still in place with its marker, the pool and trash empty. */
function leftOf(params: { workspace: BriefWorkspace; worktree: string }) {
	const worktreesFolder = join(params.workspace.workspace, '.worktrees')
	return {
		nodeModules: existsSync(join(params.worktree, 'node_modules', MARKER_FILE)),
		pool: poolEntriesOf(worktreesFolder),
		trash: trashedNamesOf(worktreesFolder),
	}
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

describe(
	'worktree prune --reclaim: a process list that cannot be read',
	{ timeout: POOL_COMMAND_CASE_MS },
	() => {
		const NOTHING_MOVED = { nodeModules: true, pool: [], trash: [] }

		it('the lister throws at the plan → the worktree kept, the processes not known, nothing moved, exit 1', async () => {
			const workspace = createReclaimWorkspace()
			const worktree = addOneWorktree(workspace)
			ageEverything({ workspace })

			const run = runReclaimListing({ workspace, flags: [], listProcesses: throwingLister })

			await expect(run.result).resolves.toMatchObject({ exitCode: 1 })
			const { output } = await run.result
			expect({
				line: lineOf({ output, name: PARKABLE }),
				left: leftOf({ workspace, worktree }),
				spawns: run.spawns,
			}).toEqual({
				line: `keep  .worktrees/${PARKABLE}  ${NOT_KNOWN}`,
				left: NOTHING_MOVED,
				spawns: [],
			})
		})

		it('the lister throws at the plan, --dry-run → the same keep line, a total of nothing, nothing moved, exit 1', async () => {
			const workspace = createReclaimWorkspace()
			const worktree = addOneWorktree(workspace)
			ageEverything({ workspace })

			const run = runReclaimListing({
				workspace,
				flags: ['--dry-run'],
				listProcesses: throwingLister,
			})

			await expect(run.result).resolves.toMatchObject({ exitCode: 1 })
			const { output } = await run.result
			expect({
				line: lineOf({ output, name: PARKABLE }),
				total: output.split('\n').filter(Boolean).at(-1),
				left: leftOf({ workspace, worktree }),
				spawns: run.spawns,
			}).toEqual({
				line: `keep  .worktrees/${PARKABLE}  ${NOT_KNOWN}`,
				total: reclaimTotalLine([]),
				left: NOTHING_MOVED,
				spawns: [],
			})
		})

		it('no process at the plan, the lister throws before the move → planned to park, kept at the move, the processes not known, nothing moved, exit 1', async () => {
			const workspace = createReclaimWorkspace()
			const worktree = addOneWorktree(workspace)
			ageEverything({ workspace })

			const run = runReclaimListing({
				workspace,
				flags: [],
				listProcesses: planThenMoveLister(throwingLister),
			})

			await expect(run.result).resolves.toMatchObject({ exitCode: 1 })
			const { output } = await run.result
			expect({
				line: lineOf({ output, name: PARKABLE }),
				left: leftOf({ workspace, worktree }),
				spawns: run.spawns,
			}).toEqual({
				line: `kept  .worktrees/${PARKABLE}  ${NOT_KNOWN}`,
				left: NOTHING_MOVED,
				spawns: [],
			})
		})

		it('the lister answers that the processes are not known (no throw) → the worktree kept with its text, nothing moved, exit 1', async () => {
			const workspace = createReclaimWorkspace()
			const worktree = addOneWorktree(workspace)
			ageEverything({ workspace })
			const notKnown = 'the processes are not known (the lister cannot run): nothing is moved'

			const run = runReclaimListing({
				workspace,
				flags: [],
				listProcesses: function answersNotKnown() {
					return notKnown
				},
			})

			await expect(run.result).resolves.toMatchObject({ exitCode: 1 })
			const { output } = await run.result
			expect({
				line: lineOf({ output, name: PARKABLE }),
				left: leftOf({ workspace, worktree }),
				spawns: run.spawns,
			}).toEqual({
				line: `keep  .worktrees/${PARKABLE}  ${notKnown}`,
				left: NOTHING_MOVED,
				spawns: [],
			})
		})

		it('the only worktree held by a working lot, the lister throws at the plan, --dry-run → kept for its lot, exit 0', async () => {
			const workspace = createReclaimWorkspace()
			const worktree = addReclaimWorktree({
				workspace,
				name: ASKING,
				lot: 'working',
				marker: ASKING,
			})
			ageEverything({ workspace })

			const run = runReclaimListing({
				workspace,
				flags: ['--dry-run'],
				listProcesses: throwingLister,
			})

			await expect(run.result).resolves.toMatchObject({ exitCode: 0 })
			const { output } = await run.result
			expect({
				line: lineOf({ output, name: ASKING }),
				left: leftOf({ workspace, worktree }),
			}).toEqual({
				line: expect.stringMatching(
					new RegExp(`^keep  \\.worktrees/${ASKING}  .*lot ${ASKING} working`),
				),
				left: NOTHING_MOVED,
			})
		})

		it('no process at the plan, a process working in the worktree before the move → kept at the move naming its pid, nothing moved, exit 0', async () => {
			// guard: a keep at the move for a known fact keeps exit 0 (D3); kills the flag widened to every process keep or every move-time keep
			const workspace = createReclaimWorkspace()
			const worktree = addOneWorktree(workspace)
			ageEverything({ workspace })

			const run = runReclaimListing({
				workspace,
				flags: [],
				listProcesses: planThenMoveLister(function working() {
					return [{ pid: WORKING_PID, folder: worktree }]
				}),
			})

			await expect(run.result).resolves.toMatchObject({ exitCode: 0 })
			const { output } = await run.result
			expect({
				line: lineOf({ output, name: PARKABLE }),
				left: leftOf({ workspace, worktree }),
				spawns: run.spawns,
			}).toEqual({
				line: `kept  .worktrees/${PARKABLE}  a process works in it: pid ${WORKING_PID}`,
				left: NOTHING_MOVED,
				spawns: [],
			})
		})
	},
)
