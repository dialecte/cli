/**
 * `lot close`: for each named hand-over of the registry (by its name or its worktree's index), its worktree
 * (the path the registry entry holds) goes to the trash and its `node_modules` to the pool. Every keep rule
 * first, with no exemption: a hand-over not committed nor abandoned, the main checkout, a worktree that is no
 * registered worktree (or one already in the trash or the pool), one on another branch than the hand-over's, a
 * locked one, a mutation run from it, a process working in it, processes that cannot be listed, a dirty
 * worktree; nothing done for a hand-over kept. Every decision is taken for every argument before anything
 * moves (one worktree, whichever arguments reach it, decided and closed once), `node_modules` checked against
 * the lockfile where it is. Then, per worktree: the links of its `node_modules` made absolute where they are,
 * the move into the trash, the park from the trashed folder, the background removal. The branch is never
 * touched.
 */
import { existsSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { realPathOf } from '../file-system.ts'
import { mainCheckoutOf, readGit } from '../git.ts'
import { WORKTREES_FOLDER } from '../workspace.constants.ts'
import { listWorktrees } from '../worktree/add-worktree.ts'
import { checkNodeModules, lockHashOf } from '../worktree/check-node-modules.ts'
import { relinkEscapingLinks } from '../worktree/copy-node-modules.ts'
import { parkNodeModules } from '../worktree/node-modules-pool.ts'
import { listProcessFolders, processWorkingIn } from '../worktree/process-folders.ts'
import { mutationRunKeeping, readOwnedRuns } from '../worktree/prune-worktrees.ts'
import { isParked, trashWorktree } from '../worktree/trash.ts'
import { WORKTREE_STATUS_ARGUMENTS } from '../worktree/worktree.constants.ts'
import { entryOfArgument, findHandoverStore } from './handover-store.ts'

import type { RunEntry } from '../mutation/mutation.types.ts'
import type {
	BackgroundSpawner,
	ListedWorktree,
	NodeModulesCheck,
	ProcessFolder,
} from '../worktree/worktree.types.ts'
import type { CloseResult, CloseTarget } from './handover.types.ts'

/** Each named hand-over closed or kept with why; the names the registry does not hold (nothing done then). */
export function closeHandovers(params: {
	/** Where the registry is looked for (a worktree or the main checkout of the repository). */
	cwd: string
	/** Hand-over names or worktree indexes. */
	names: string[]
	now: Date
	spawner: BackgroundSpawner
	/** Lists the processes and their working folders (the tests stand in for it); default: the system's. A throw is "not known". */
	listProcesses?: () => ProcessFolder[] | string
}): CloseResult[] | { unknown: string[] } {
	const main = mainCheckoutOf(params.cwd)
	const store = findHandoverStore(params.cwd)
	const entries = params.names.map((argument) => entryOfArgument({ argument, store }))
	if (entries.some((entry) => entry === undefined))
		return { unknown: params.names.filter((_name, index) => entries[index] === undefined) }
	// a worktree already in the trash or the pool is on its way out: never a target again
	const worktrees = listWorktrees(main).filter(
		(worktree) => !isParked({ path: worktree.path, main }),
	)
	const targets = params.names.map(function targetOf(argument, index): CloseTarget {
		const entry = entries[index]
		return {
			argument,
			entry,
			worktree: worktrees.find(
				(worktree) => entry && realPathOf(worktree.path) === realPathOf(entry.worktree),
			),
		}
	})
	const worktreesFolder = join(dirname(main), WORKTREES_FOLDER)
	const runs = readOwnedRuns(main)
	const processes = readProcesses(params.listProcesses ?? listProcessFolders)
	// one worktree is closed once, whichever names and indexes reach it: keyed by its real path
	function keyOf(target: CloseTarget): string {
		return target.entry ? realPathOf(target.entry.worktree) : target.argument
	}
	// every decision first, nothing moved yet: each argument with every keep rule (its own state, its own
	// branch), and the check of its worktree's node_modules
	const decisions = targets.map(function decide(target) {
		return decideTarget({ target, main, worktreesFolder, runs, processes })
	})
	// a worktree closes only when every argument reaching it may close: the first that keeps it, in any order
	const owners = new Map<string, CloseTarget>()
	const keeps = new Map<string, { argument: CloseTarget; kept: string }>()
	targets.forEach(function group(target, index) {
		const key = keyOf(target)
		if (!owners.has(key)) owners.set(key, target)
		const decision = decisions[index]
		if ('kept' in decision && !keeps.has(key))
			keeps.set(key, { argument: target, kept: decision.kept })
	})
	// then the moves, each worktree its own outcome: a failure keeps it with the reason, the others go on
	const results = new Map(
		[...owners].map(function act([key, target]): [string, CloseResult] {
			const handover = target.entry?.name ?? target.argument
			const decision = decisions[targets.indexOf(target)]
			const keep = keeps.get(key)
			if (keep || 'kept' in decision)
				return [key, { outcome: { handover, kept: keep?.kept ?? 'not decided' }, moved: [] }]
			const moved: string[] = []
			try {
				const nodeModules = closeWorktree({
					worktree: target.worktree?.path ?? '',
					check: decision.check,
					checkedLockHash: decision.checkedLockHash,
					main,
					worktreesFolder,
					now: params.now,
					spawner: params.spawner,
					moved,
				})
				return [key, { outcome: { handover, closed: true }, moved, nodeModules }]
			} catch (error) {
				const done = moved.length ? ` (already in the trash: ${moved.join(', ')})` : ''
				return [
					key,
					{ outcome: { handover, kept: `${(error as Error).message.trim()}${done}` }, moved },
				]
			}
		}),
	)
	// one outcome per argument: its own reason when it keeps the worktree, else the reason that keeps it
	return targets.map(function outcomeOf(target, index): CloseResult {
		const key = keyOf(target)
		const decision = decisions[index]
		const keep = keeps.get(key)
		const result = results.get(key)
		const handover = target.entry?.name ?? target.argument
		if ('kept' in decision) return { outcome: { handover, kept: decision.kept }, moved: [] }
		if (keep && keep.argument !== target)
			return {
				outcome: {
					handover,
					kept: `the same worktree as ${keep.argument.entry?.name ?? keep.argument.argument}, kept: ${keep.kept}`,
				},
				moved: [],
			}
		if (!result || owners.get(key) === target)
			return result ?? { outcome: { handover, kept: 'not decided' }, moved: [] }
		const same = `the same worktree as ${result.outcome.handover}`
		return 'closed' in result.outcome
			? { outcome: { handover, closed: true }, moved: [same] }
			: { outcome: { handover, kept: `${same}: ${result.outcome.kept}` }, moved: [] }
	})
}

/**
 * Why the target stays, or, when it may close, the check of its `node_modules` against its lockfile, made
 * where it is now (a relative `file:` link resolves there, not from the trash). Nothing moves here; a failure
 * keeps the target with the reason.
 */
function decideTarget(params: {
	target: CloseTarget
	main: string
	worktreesFolder: string
	runs: readonly RunEntry[]
	processes: readonly ProcessFolder[] | string
}):
	| { kept: string }
	| { check: NodeModulesCheck | undefined; checkedLockHash: string | undefined } {
	try {
		const kept =
			whyKeep(params) ??
			(existsSync(params.worktreesFolder)
				? undefined
				: `no ${WORKTREES_FOLDER}/ beside ${params.main}: the pool and the trash live there`)
		if (kept) return { kept }
		const worktree = params.target.worktree?.path
		if (!worktree || !existsSync(join(worktree, 'node_modules')))
			return { check: undefined, checkedLockHash: undefined }
		// the lockfile's hash read with the check: the pool entry is stamped with what the check read
		return { checkedLockHash: lockHashOf(worktree), check: checkNodeModules({ worktree }) }
	} catch (error) {
		return { kept: (error as Error).message.trim() }
	}
}

/** The processes, or "not known" when the lister throws or cannot tell: then everything is kept. */
function readProcesses(listProcesses: () => ProcessFolder[] | string): ProcessFolder[] | string {
	try {
		return listProcesses()
	} catch (error) {
		return `the processes are not known (${(error as Error).message}): nothing is moved`
	}
}

/** Why the hand-over's worktree stays, or undefined when it may close. */
function whyKeep(params: {
	target: CloseTarget
	main: string
	runs: readonly RunEntry[]
	/** The processes and their working folders, or why the system could not tell (then nothing closes). */
	processes: readonly ProcessFolder[] | string
}): string | undefined {
	const { target } = params
	const entry = target.entry
	if (!entry) return 'no hand-over of that name or index'
	if (entry.state !== 'committed' && entry.state !== 'abandoned')
		return `${entry.state}: only a committed or abandoned hand-over closes`
	if (realPathOf(entry.worktree) === realPathOf(params.main))
		return `its worktree is the main checkout ${params.main}: never parked, moved or trashed`
	const worktree: ListedWorktree | undefined = target.worktree
	if (!worktree)
		return `${entry.worktree} is no worktree of the repository (closed already, moved, or in the trash): nothing to close`
	if (worktree.branch !== entry.branch)
		return `on ${worktree.branch ?? 'a detached HEAD'}, not on the hand-over's branch ${entry.branch}: the worktree holds other work now`
	if (worktree.locked)
		return `locked: ${worktree.path} (git worktree unlock it first, if it may go)`
	const run = mutationRunKeeping({ runs: params.runs, folder: worktree.path })
	if (run) return `${run} (from ${worktree.path})`
	if (typeof params.processes === 'string') return params.processes
	const working = processWorkingIn({ processes: params.processes, folder: worktree.path })
	if (working) return `a process works in ${worktree.path}: pid ${working.pid}`
	const status = readGit({ root: worktree.path, args: [...WORKTREE_STATUS_ARGUMENTS] })
		.split('\n')
		.filter(Boolean)
	if (status.length) return `dirty: ${status.length} path(s) git status lists in ${worktree.path}`
	return undefined
}

/**
 * The links of the worktree's `node_modules` made absolute where they are (before any move changes what a
 * relative link reaches), the worktree moved to the trash, its `node_modules` parked from there with the check
 * made before the move (its caches left in the trashed folder), then the background removal. `moved` collects
 * the folder name once moved. Answers where `node_modules` went.
 */
function closeWorktree(params: {
	worktree: string
	/** `node_modules` read against the lockfile where it was, before the move. */
	check: NodeModulesCheck | undefined
	/** sha256 of the lockfile `check` read, read with it. */
	checkedLockHash: string | undefined
	main: string
	worktreesFolder: string
	now: Date
	spawner: BackgroundSpawner
	moved: string[]
}): string | undefined {
	const { worktree, main, worktreesFolder, now } = params
	const nodeModules = join(worktree, 'node_modules')
	if (existsSync(nodeModules)) relinkEscapingLinks({ from: nodeModules, to: nodeModules })
	const removals: { command: string; args: string[]; cwd?: string }[] = []
	// the removal waits until the park is done: recorded here, started after it
	function recordRemoval(call: { command: string; args: string[]; cwd?: string }): void {
		removals.push(call)
	}
	const { trashed } = trashWorktree({
		worktree,
		repository: main,
		worktreesFolder,
		now,
		spawner: recordRemoval,
	})
	params.moved.push(basename(worktree))
	let where: string | undefined
	if (existsSync(join(trashed, 'node_modules'))) {
		// a park that cannot be made leaves node_modules in the trashed worktree: it goes with it
		const parked = parkNodeModules({
			worktree: trashed,
			repository: main,
			worktreesFolder,
			now,
			spawner: params.spawner,
			discardInto: trashed,
			check: params.check,
			checkedLockHash: params.checkedLockHash,
		})
		where = typeof parked === 'string' ? `trashed: ${parked}` : `pooled in ${parked.entry}`
	}
	for (const removal of removals) params.spawner(removal)
	return where
}
