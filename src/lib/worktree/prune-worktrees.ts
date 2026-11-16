/**
 * `dialecte worktree prune`: per repository of the workspace, the worktrees and local branches whose
 * commits are all in the base branch, the hand-over folders already committed, and the rehearsal clones
 * left behind - each with the command that removes it, with its absolute `cd`. Never a worktree an open lot names
 * (checked first, reason `lot <full name> <state>`), an unmerged branch,
 * a dirty worktree, one a pending hand-over commits in, or one a mutation run that still runs (or died before
 * reporting) was started from; never a symbolic link (the sibling link
 * `.worktrees/core -> ../core` among them) nor a folder a link reaches. The pool entries (`_pool-*`) and the
 * trash (`_trash/`, a worktree in it included) are counted, never listed nor touched.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path'

import { isAtOrInside, isPresent, realPathOf } from '../file-system.ts'
import { findBaseBranchRef } from '../gate/gate-base.ts'
import { readHooksFolder } from '../git-hooks.ts'
import { readGit } from '../git.ts'
import { handoverLockPath } from '../handover/handover-lock.ts'
import { readStoreEntries } from '../handover/handover-store-read.ts'
import { REHEARSAL_FOLDER_PREFIX, REHEARSAL_MARKER_FILE } from '../handover/handover.constants.ts'
import { handoverState } from '../handover/list-handovers.ts'
import { readHandoverFolder } from '../handover/read-handover-folder.ts'
import { diedRunLine, runningLine } from '../mutation/pending-verdict.ts'
import { readRuns } from '../mutation/run-store.ts'
import { readPackageJson } from '../package-json.ts'
import { isProcessAlive } from '../process-alive.ts'
import { shellQuote } from '../shell-quote.ts'
import { lotsKeepingWorktrees, readLotKeeps } from '../store/lot-keep.ts'
import { gitFolderAbove, listLotIdentities, locateStore } from '../store/store-folder.ts'
import { COMMIT_PLAN_FOLDER, WORKTREES_FOLDER } from '../workspace.constants.ts'
import { listWorktrees } from './add-worktree.ts'
import { checkNodeModules } from './check-node-modules.ts'
import { readHygieneBaseline } from './hygiene.ts'
import { computeLockKey } from './lock-key.ts'
import {
	createPoolCache,
	listPoolEntries,
	readPackageLockText,
	readPoolCap,
} from './node-modules-pool.ts'
import { listProcessFolders, processWorkingIn } from './process-folders.ts'
import { isParked, spawnDetached, trashFolder } from './trash.ts'
import {
	IGNORED_FILES_SHOWN,
	NODE_MODULES_PROBLEMS_SHOWN,
	POOL_MISS_KEY_LENGTH,
	PRUNE_LINK_REASON,
	PRUNE_RUN_PREFIX,
	REBUILT_IGNORED_FOLDERS,
	REBUILT_IGNORED_NAMES,
	MINUTE_MS,
	POOL_ENTRY_PATTERN,
	POOL_FILE,
	POOL_LEFT_OVER_KEEP_REASONS,
	POOL_STALE_PARK_MINUTES,
	RECLAIM_ACTIVITY_FILES,
	RECLAIM_DAY_MS,
	RECLAIM_GONE,
	RECLAIM_KEEP_REASONS,
	RECLAIM_ROUND_PATTERN,
	RECLAIM_SIZE_UNITS,
	RECLAIM_TRASH_REASONS,
	RECLAIM_WORKTREE_GONE,
	TRASH_FOLDER,
	WORKTREE_LOCKED_FILE,
	WORKTREE_STATUS_ARGUMENTS,
} from './worktree.constants.ts'

import type { HandoverFolder, StoreEntry } from '../handover/handover.types.ts'
import type { RunEntry } from '../mutation/mutation.types.ts'
import type {
	BackgroundSpawner,
	FolderLink,
	ListedWorktree,
	ProcessFolder,
	PruneHandover,
	PruneItem,
	PrunePlan,
	ReclaimContext,
	ReclaimItem,
	ReclaimOutcome,
	ReclaimPlan,
	ReclaimRepositoryRun,
	ReclaimRound,
	WorkspacePrunePlan,
} from './worktree.types.ts'
import type { Dirent } from 'node:fs'

export function planPrune(params: {
	workspace: string
	/** Hand-over folders found under the workspace's `_commit-plan`. */
	handoverFolders: readonly string[]
	/** Where rehearsal folders are made. */
	scratchRoot: string
	/** Where earlier cli versions made rehearsal clones, looked in too when it is not `scratchRoot`. */
	formerScratchRoot?: string
	/** The clock a pool left-over's age is read against; default: now. */
	now?: Date
	/** Lists the processes and their working folders (the tests stand in for it); default: the system's. */
	listProcesses?: () => ProcessFolder[] | string
}): WorkspacePrunePlan {
	const scratchRoots = [
		...new Set([params.scratchRoot, params.formerScratchRoot ?? params.scratchRoot]),
	]
	// each hand-over's repository read once for the whole workspace, never once per repository
	const handovers = params.handoverFolders.flatMap(function read(folder): PruneHandover[] {
		const handover = readHandoverFolder(folder)
		if (typeof handover === 'string') return []
		return [{ handover, commonFolder: commonFolderOf(handover.lotsFile.repository) }]
	})
	const links = linkRootsOf({ workspace: params.workspace, scratchRoots }).flatMap((folder) =>
		findLinks(folder),
	)
	const repositories = listMainCheckouts(params.workspace).map((repository) =>
		planRepository({ repository, handovers, links }),
	)
	const scratch = scratchRoots.flatMap(function rehearsalsIn(scratchRoot) {
		if (!existsSync(scratchRoot)) return []
		return readdirSync(scratchRoot)
			.filter((name) => name.startsWith(REHEARSAL_FOLDER_PREFIX))
			.sort()
			.map((name) => planRehearsalClone({ scratchRoot, name, links }))
	})
	const worktreesFolder = join(params.workspace, WORKTREES_FOLDER)
	return {
		repositories,
		scratch,
		pool: countPoolEntries(worktreesFolder),
		poolLeftOver: planPoolLeftOvers({
			worktreesFolder,
			now: params.now ?? new Date(),
			listProcesses: params.listProcesses ?? listProcessFolders,
		}),
		trash: countTrashed(worktreesFolder),
	}
}

/**
 * `worktree prune --reclaim`: every worktree of every repository of the workspace, decided and nothing moved. An idle
 * worktree (the invariant holds: not the main checkout, not locked, no open lot nor open hand-over names it, no process
 * works in it, no link reaches it, no git activity in its index, HEAD or reflog after `now` minus `olderThanDays`) has
 * its `node_modules` parked when its lock key is the main checkout's and it passes its check, else trashed; a
 * `-round-<n>` throwaway whose lot is closed is trashed whole; every other worktree is kept with why.
 *
 * @intent free the node_modules of idle worktrees without ever touching one in use
 * @internal
 */
export function planReclaim(params: {
	workspace: string
	now: Date
	/** Git activity in the last `olderThanDays` days keeps a worktree. */
	olderThanDays: number
	/** Lists the processes and their working folders (the tests stand in for it); default: the system's. */
	listProcesses?: () => ProcessFolder[] | string
	/** Where rehearsal clones are made: their links are read with the workspace's. Default: none. */
	scratchRoots?: readonly string[]
}): ReclaimPlan {
	const cutoff = new Date(params.now.getTime() - params.olderThanDays * RECLAIM_DAY_MS)
	const processes = (params.listProcesses ?? listProcessFolders)()
	const links = linkRootsOf({
		workspace: params.workspace,
		scratchRoots: params.scratchRoots ?? [],
	}).flatMap((folder) => findLinks(folder))
	const items = listMainCheckouts(params.workspace).flatMap(function planOf(repository) {
		const context = readReclaimContext({
			repository,
			workspace: params.workspace,
			cutoff,
			processes,
			links,
		})
		const worktrees = context.listed
			.slice(1)
			.filter((listed) => !isParked({ path: listed.path, main: repository }))
			.map((listed) => decideReclaim({ listed, context }))
		return [mainCheckoutItem(repository), ...worktrees]
	})
	return { cutoff, items }
}

/**
 * Carries out a reclaim plan: every keep rule checked again just before each move (a worktree locked, active, named
 * or worked in since the plan is kept, its line says why), then each `park` through the pool cache, each `trash` and
 * `trash whole` through the trash (git forgets a worktree trashed whole); what is gone since the plan (another
 * reclaim) is a line, and a move that throws (a folder moved under it by another park or take) a refused line, never
 * a throw: the next items still run. The workspace-wide facts (the processes, the links, each repository's worktree
 * list, store, hand-over registry, runs and pool cap) are read once per execution, at its first move, and kept up to
 * date in memory as items move; the facts of one worktree (gone, locked, git activity, a hand-over running in it) are
 * read again just before its move. A process that starts working in a worktree after the execution read the
 * processes is not seen: the window between that read and the move is known and accepted.
 *
 * @intent move only what the plan decided, and survive a concurrent reclaim
 * @internal
 */
export function executeReclaim(params: {
	plan: ReclaimPlan
	workspace: string
	now: Date
	/** Starts the background removals of the trash; default: `spawnDetached`. */
	spawner?: BackgroundSpawner
	/** Lists the processes for the keep rules checked again before each move, once per execution; default: the system's. */
	listProcesses?: () => ProcessFolder[] | string
	/** Where rehearsal clones are made: their links are read with the workspace's. Default: none. */
	scratchRoots?: readonly string[]
}): ReclaimOutcome[] {
	const { workspace } = params
	const spawner = params.spawner ?? spawnDetached
	let shared: { processes: readonly ProcessFolder[] | string; links: FolderLink[] } | undefined
	const runs = new Map<string, ReclaimRepositoryRun>()
	/** The repository's facts of this execution: read at its first move, then as the moves left them. */
	function runOf(repository: string): ReclaimRepositoryRun {
		shared ??= {
			processes: (params.listProcesses ?? listProcessFolders)(),
			links: linkRootsOf({ workspace, scratchRoots: params.scratchRoots ?? [] }).flatMap((folder) =>
				findLinks(folder),
			),
		}
		const run = runs.get(repository) ?? {
			context: readReclaimContext({ repository, workspace, cutoff: params.plan.cutoff, ...shared }),
			cap: undefined,
		}
		runs.set(repository, run)
		return run
	}
	return params.plan.items.map(function carryOut(item): ReclaimOutcome {
		if (item.action === 'keep')
			return { worktree: item.worktree, line: reclaimItemLine({ item, workspace }), moved: false }
		const run = runOf(item.repository)
		if (item.action === 'park') run.cap ??= readPoolCap({ repository: item.repository })
		const moved = moveReclaimItem({
			item,
			context: run.context,
			cap: run.cap,
			now: params.now,
			spawner,
		})
		run.context = moved.context
		return moved.outcome
	})
}

/** The repositories of the workspace: its folders (not links) that are a main checkout, in directory order. */
export function listMainCheckouts(workspace: string): string[] {
	return readdirSync(workspace, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && isMainCheckout(join(workspace, entry.name)))
		.map((entry) => join(workspace, entry.name))
}

/**
 * The folders whose links (one level, never followed) may reach a worktree or a folder of the workspace: the
 * workspace, its `.worktrees/` and `_commit-plan/`, and the scratch roots.
 */
export function linkRootsOf(params: {
	workspace: string
	scratchRoots: readonly string[]
}): string[] {
	return [
		params.workspace,
		join(params.workspace, WORKTREES_FOLDER),
		join(params.workspace, COMMIT_PLAN_FOLDER),
		...params.scratchRoots,
	]
}

/**
 * The `_pool-*` folders without a `pool.json` (never taken nor evicted), each an item: a park that never finished
 * (unwritten for `POOL_STALE_PARK_MINUTES`, no process in it) goes to the trash, its command named; one written lately
 * (a park in progress) or worked in by a process is kept with why. The processes are listed only when a folder is old
 * enough to go.
 */
function planPoolLeftOvers(params: {
	worktreesFolder: string
	now: Date
	listProcesses: () => ProcessFolder[] | string
}): PruneItem[] {
	const { worktreesFolder } = params
	if (!isDirectory(worktreesFolder)) return []
	let processes: readonly ProcessFolder[] | string | undefined
	return readdirSync(worktreesFolder)
		.filter((name) => POOL_ENTRY_PATTERN.test(name))
		.sort()
		.map((name) => join(worktreesFolder, name))
		.filter((folder) => !existsSync(join(folder, POOL_FILE)))
		.map(function planOf(folder): PruneItem {
			const item = { kind: 'pool left-over' as const, name: folder }
			const inProgress = whyParkInProgress({ folder, now: params.now })
			if (inProgress !== undefined) return { ...item, kept: inProgress }
			processes ??= params.listProcesses()
			// the reclaim's rule: a process working in it, or the processes not known, keeps it
			const working = whyKeepByProcess({ worktree: folder, processes })
			if (working !== undefined) return { ...item, kept: working }
			return {
				...item,
				// what `--yes` does (a move into the trash), never a removal a person could copy
				command: `cd ${shellQuote(worktreesFolder)} && mkdir -p ${TRASH_FOLDER} && mv ${shellQuote(basename(folder))} ${TRASH_FOLDER}/`,
			}
		})
}

/** The folder was written under `POOL_STALE_PARK_MINUTES` ago (a park may be writing it): why; undefined when older. */
function whyParkInProgress(params: { folder: string; now: Date }): string | undefined {
	let written: Date
	try {
		written = statSync(params.folder).mtime
	} catch {
		// gone meanwhile: a park or a take finished with it
		return POOL_LEFT_OVER_KEEP_REASONS.finished
	}
	if (params.now.getTime() - written.getTime() >= POOL_STALE_PARK_MINUTES * MINUTE_MS)
		return undefined
	return POOL_LEFT_OVER_KEEP_REASONS.inProgress
		.replace('{at}', written.toISOString())
		.replace('{minutes}', String(POOL_STALE_PARK_MINUTES))
}

/**
 * A pool left-over `prune --yes` removes, sent to the trash (a background removal) once its keep rules are read again
 * just before: still no `pool.json` (a park that finished is an entry now), still unwritten for
 * `POOL_STALE_PARK_MINUTES`, no process working in it (`listProcesses`, called at most once a run by the caller's
 * memo). The line to print.
 *
 * @intent never trash a park that finished or is writing since the plan
 * @internal
 */
export function trashPoolLeftOver(params: {
	folder: string
	worktreesFolder: string
	now: Date
	spawner: BackgroundSpawner
	/** The processes and their working folders, or why they are not known. */
	listProcesses: () => readonly ProcessFolder[] | string
}): string {
	const { folder } = params
	const kept = existsSync(join(folder, POOL_FILE))
		? POOL_LEFT_OVER_KEEP_REASONS.finished
		: (whyParkInProgress({ folder, now: params.now }) ??
			whyKeepByProcess({ worktree: folder, processes: params.listProcesses() }))
	if (kept !== undefined) return `✗ ${folder} kept: ${kept}`
	try {
		const { trashed } = trashFolder({
			folder,
			worktreesFolder: params.worktreesFolder,
			now: params.now,
			spawner: params.spawner,
		})
		return `✓ ${folder} sent to the trash: ${trashed}`
	} catch (error) {
		return `✗ ${folder}: ${(error as Error).message}`
	}
}

/** The pool entries of each repository, in name order of the repositories. */
function countPoolEntries(worktreesFolder: string): { repository: string; entries: number }[] {
	const counts = new Map<string, number>()
	for (const entry of listPoolEntries(worktreesFolder))
		counts.set(entry.file.repository, (counts.get(entry.file.repository) ?? 0) + 1)
	return [...counts]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([repository, entries]) => ({ repository, entries }))
}

/** How many folders wait in `.worktrees/_trash/`. */
function countTrashed(worktreesFolder: string): number {
	const trash = join(worktreesFolder, TRASH_FOLDER)
	return isDirectory(trash) ? readdirSync(trash).length : 0
}

/**
 * Why a run of the repository keeps `folder`: one still running, or one that died before reporting, was
 * started from it; undefined when none was.
 */
export function mutationRunKeeping(params: {
	runs: readonly RunEntry[]
	folder: string
}): string | undefined {
	const folder = realpathSync(params.folder)
	const owned = params.runs.find((run) => realpathSync(run.worktree) === folder)
	if (!owned) return undefined
	return `${PRUNE_RUN_PREFIX}${owned.state === 'running' ? runningLine(owned) : diedRunLine(owned)}`
}

/** The runs of the repository that still run, or died before reporting, whose worktree is on disk. */
export function readOwnedRuns(repository: string): RunEntry[] {
	return readRuns({ root: repository }).filter(
		(run) => (run.state === 'running' || run.state === 'died') && existsSync(run.worktree),
	)
}

function planRepository(params: {
	repository: string
	handovers: readonly PruneHandover[]
	/** The links found around the workspace: what they reach is kept. */
	links: readonly FolderLink[]
}): PrunePlan {
	const { repository } = params
	const found = findBaseBranchRef({ root: repository, packageJson: readPackageJson(repository) })
	if ('refusal' in found) return { repository, items: [], skipped: found.refusal }
	const baseBranch = found.branch
	// merged work is compared with the base where it is newest (`findBaseRef`): origin's once the queue lands there
	const baseRef = found.ref
	const cd = `cd ${shellQuote(repository)} &&`
	const commonFolder = commonFolderOf(repository)
	// each hand-over's state read once (it has one repository): three places of the plan ask it
	const mine = params.handovers
		.filter((entry) => entry.commonFolder !== undefined && entry.commonFolder === commonFolder)
		.map((entry) => ({ ...entry.handover, state: handoverStateOf(entry.handover) }))
	const pendingWorktrees = new Set(
		mine
			.filter((handover) => !['committed', 'repository missing'].includes(handover.state))
			.map((handover) => realpathSync(handover.lotsFile.repository)),
	)
	const pendingBranches = new Set(
		mine
			.filter((handover) => handover.state !== 'committed')
			.map((handover) => handover.lotsFile.branch),
	)

	const items: PruneItem[] = []
	// the branch the main checkout is on stays, merged or not
	const checkedOut = readGit({
		root: repository,
		args: ['rev-parse', '--abbrev-ref', 'HEAD'],
	}).trim()
	const keptBranches = new Set<string>([baseBranch, checkedOut])
	// a run that still runs, or died before reporting, needs the worktree it was started from
	const ownedRuns = readOwnedRuns(repository)
	const worktrees = listWorktrees(repository)
		.slice(1)
		.map((worktree) => ({
			...worktree,
			name: spellUnder({ path: worktree.path, folder: dirname(repository) }),
		}))
		.filter(function listed(worktree) {
			if (!isParked({ path: worktree.path, main: repository })) return true
			// in the trash (or the pool): its background removal frees its branch; until then git refuses to delete it
			if (worktree.branch) keptBranches.add(worktree.branch)
			return false
		})
	// `git worktree prune` unregisters every worktree whose folder holds no checkout: a link's too, when
	// what it points to holds no `.git`
	const linkedWorktrees = worktrees
		.map((worktree) => worktree.name)
		.filter((name) => isLink(name) && !existsSync(join(name, '.git')))
	// the lot keep rule first: the store read once for the repository
	const lotKeeps = lotsKeepingWorktrees({ repository })
	for (const worktree of worktrees) {
		const { name } = worktree
		const lotKeep = lotKeeps.get(realPathOf(name))
		if (lotKeep) {
			if (worktree.branch) keptBranches.add(worktree.branch)
			items.push({
				kind: 'worktree',
				name,
				kept: worktree.branch ? `${worktree.branch}: ${lotKeep}` : lotKeep,
			})
			continue
		}
		if (isLink(name)) {
			if (worktree.branch) keptBranches.add(worktree.branch)
			items.push({ kind: 'worktree', name, kept: PRUNE_LINK_REASON })
			continue
		}
		if (!worktree.branch) {
			items.push({ kind: 'worktree', name, kept: 'detached HEAD' })
			continue
		}
		const kept = existsSync(name)
			? whyKeepWorktree({
					repository,
					worktree: name,
					branch: worktree.branch,
					baseBranch,
					baseRef,
					pending: pendingWorktrees.has(realpathSync(name)),
					links: params.links,
					ownedRuns,
				})
			: undefined
		if (kept) {
			keptBranches.add(worktree.branch)
			items.push({ kind: 'worktree', name, kept: `${worktree.branch}: ${kept}` })
		} else if (!existsSync(name) && linkedWorktrees.length > 0) {
			keptBranches.add(worktree.branch)
			items.push({
				kind: 'worktree',
				name,
				kept: `${worktree.branch}: deleted from disk; pruning it would also unregister the worktree at the link ${linkedWorktrees.join(', ')}`,
			})
		} else
			items.push({
				kind: 'worktree',
				name,
				command: existsSync(name)
					? `${cd} git worktree remove ${shellQuote(name)}`
					: `${cd} git worktree prune`,
			})
	}

	for (const branch of readGit({
		root: repository,
		args: ['for-each-ref', '--format=%(refname:short)', 'refs/heads'],
	})
		.split('\n')
		.filter(Boolean)) {
		if (keptBranches.has(branch)) continue
		const unmerged = unmergedCount({ root: repository, branch, baseRef })
		if (unmerged > 0) continue
		if (pendingBranches.has(branch)) {
			items.push({ kind: 'branch', name: branch, kept: 'a hand-over is pending on it' })
			continue
		}
		const keptByReflog = whyKeepByReflog({
			root: repository,
			branch,
			baseBranch,
			baseRef,
			baselineHead: undefined,
		})
		if (keptByReflog) {
			items.push({ kind: 'branch', name: branch, kept: keptByReflog })
			continue
		}
		items.push({
			kind: 'branch',
			name: branch,
			command: `${cd} git branch -d ${shellQuote(branch)}`,
		})
	}

	for (const handover of mine) {
		if (handover.state !== 'committed') continue
		const { folder } = handover
		if (isReachedThroughLink({ path: folder, root: dirname(repository) })) {
			items.push({ kind: 'hand-over', name: folder, kept: PRUNE_LINK_REASON })
			continue
		}
		if (!isRemovableHandoverFolder(folder)) continue
		const reachedBy = linkReaching({ folder, links: params.links })
		items.push(
			reachedBy
				? { kind: 'hand-over', name: folder, kept: `the link ${reachedBy} points to it` }
				: {
						kind: 'hand-over',
						name: folder,
						command: `cd ${shellQuote(dirname(folder))} && rm -rf ${shellQuote(basename(folder))}`,
					},
		)
	}
	return { repository, baseBranch, items }
}

/** The symbolic links directly in `folder`, each with the real path it reaches (a dangling one left out). */
export function findLinks(folder: string): FolderLink[] {
	if (!existsSync(folder)) return []
	return readdirSync(folder, { withFileTypes: true })
		.filter((entry) => entry.isSymbolicLink())
		.flatMap(function reach(entry): FolderLink[] {
			const link = join(folder, entry.name)
			try {
				// spelled as on disk, as `realPathOf` spells the folders it is compared with; a dangling link throws
				return [{ link, target: realpathSync.native(link) }]
			} catch {
				return []
			}
		})
}

/** A link that reaches the folder or something inside it: removing the folder would break it. */
export function linkReaching(params: {
	folder: string
	links: readonly FolderLink[]
}): string | undefined {
	const real = realpathSync.native(params.folder)
	return params.links.find((link) => isAtOrInside({ path: link.target, folder: real }))?.link
}

/**
 * The path, or a folder on its way down from `root` (the workspace), is a symbolic link: removing it would
 * remove what a link points to. Only the path itself is looked at when it is not under `root`.
 */
function isReachedThroughLink(params: { path: string; root: string }): boolean {
	const fromRoot = relative(params.root, params.path)
	if (
		fromRoot === '' ||
		fromRoot === '..' ||
		fromRoot.startsWith(`..${sep}`) ||
		isAbsolute(fromRoot)
	)
		return isLink(params.path)
	for (
		let folder = params.path;
		folder !== params.root && folder !== dirname(folder);
		folder = dirname(folder)
	)
		if (isLink(folder)) return true
	return false
}

/** The path itself is a symbolic link (dangling or not). */
function isLink(path: string): boolean {
	try {
		return lstatSync(path).isSymbolicLink()
	} catch {
		return false
	}
}

/** A folder of its own: not `_commit-plan` itself, nor one holding other folders (more hand-overs, notes). */
function isRemovableHandoverFolder(folder: string): boolean {
	if (basename(folder) === COMMIT_PLAN_FOLDER) return false
	return !readdirSync(folder, { withFileTypes: true }).some((entry) => entry.isDirectory())
}

/** A repository's main checkout: a `.git` folder holding a HEAD (a linked worktree has a `.git` file). */
function isMainCheckout(folder: string): boolean {
	const gitFolder = join(folder, '.git')
	return (
		existsSync(gitFolder) &&
		statSync(gitFolder).isDirectory() &&
		existsSync(join(gitFolder, 'HEAD'))
	)
}

/**
 * A rehearsal goes when the process that made it is gone; kept while it runs or without a marker. Its
 * marker is in the clone's git folder: the entry itself (an earlier cli's clone) or the clone inside it (a
 * rehearsal folder, which goes whole).
 */
function planRehearsalClone(params: {
	scratchRoot: string
	name: string
	links: readonly FolderLink[]
}): PruneItem {
	const clone = join(params.scratchRoot, params.name)
	if (isLink(clone)) return { kind: 'rehearsal clone', name: clone, kept: PRUNE_LINK_REASON }
	const marker = readRehearsalMarker(rehearsalMarkerPath(clone))
	if (!marker)
		return {
			kind: 'rehearsal clone',
			name: clone,
			kept: 'no rehearsal marker: not made by this cli, or still starting',
		}
	if (isProcessAlive(marker.pid))
		return {
			kind: 'rehearsal clone',
			name: clone,
			kept: `its rehearsal still runs: pid ${marker.pid}`,
		}
	const reachedBy = linkReaching({ folder: clone, links: params.links })
	if (reachedBy)
		return { kind: 'rehearsal clone', name: clone, kept: `the link ${reachedBy} points to it` }
	return {
		kind: 'rehearsal clone',
		name: clone,
		command: `cd ${shellQuote(params.scratchRoot)} && rm -rf ${shellQuote(params.name)}`,
	}
}

/** The marker of the rehearsal in `entry`: in its own git folder, else in that of a clone inside it. */
function rehearsalMarkerPath(entry: string): string {
	const ownMarker = join(entry, '.git', REHEARSAL_MARKER_FILE)
	if (existsSync(ownMarker) || !isDirectory(entry)) return ownMarker
	const inside = readdirSync(entry, { withFileTypes: true })
		.filter((child) => child.isDirectory())
		.map((child) => join(entry, child.name, '.git', REHEARSAL_MARKER_FILE))
	return inside.find((path) => existsSync(path)) ?? ownMarker
}

function isDirectory(path: string): boolean {
	try {
		return statSync(path).isDirectory()
	} catch {
		return false
	}
}

function readRehearsalMarker(path: string): { pid: number } | undefined {
	if (!existsSync(path)) return undefined
	try {
		const marker = JSON.parse(readFileSync(path, 'utf8')) as { pid?: unknown }
		return typeof marker.pid === 'number' ? { pid: marker.pid } : undefined
	} catch {
		return undefined
	}
}

/** Why a worktree stays, or undefined when it may go. */
function whyKeepWorktree(params: {
	repository: string
	worktree: string
	branch: string
	baseBranch: string
	/** The ref merged work is compared with (`findBaseRef`). */
	baseRef: string
	pending: boolean
	links: readonly FolderLink[]
	/** The repository's runs that still run or died before reporting: the worktree one was started from stays. */
	ownedRuns: readonly RunEntry[]
}): string | undefined {
	const reachedBy = linkReaching({ folder: params.worktree, links: params.links })
	if (reachedBy) return `the link ${reachedBy} points to it`
	const ownedRun = mutationRunKeeping({ runs: params.ownedRuns, folder: params.worktree })
	if (ownedRun) return ownedRun
	const unmerged = unmergedCount({
		root: params.repository,
		branch: params.branch,
		baseRef: params.baseRef,
	})
	if (unmerged > 0) return `${unmerged} commit(s) not in ${params.baseBranch}`
	if (params.pending || existsSync(handoverLockPath(params.worktree)))
		return 'a hand-over is pending in it'
	if (
		readGit({
			root: params.worktree,
			args: [...WORKTREE_STATUS_ARGUMENTS],
		}).trim()
	)
		return 'uncommitted changes'
	const keptByReflog = whyKeepByReflog({
		root: params.repository,
		branch: params.branch,
		baseBranch: params.baseBranch,
		baseRef: params.baseRef,
		baselineHead: readHygieneBaseline(params.worktree)?.head,
	})
	if (keptByReflog) return keptByReflog
	const ignored = listRemovableIgnored(params.worktree)
	if (ignored.length > IGNORED_FILES_SHOWN)
		return `${ignored.length} ignored files git worktree remove would delete, first: ${ignored.slice(0, IGNORED_FILES_SHOWN).join(', ')}`
	if (ignored.length) return `ignored files git worktree remove would delete: ${ignored.join(', ')}`
	return undefined
}

/**
 * Why the reflog keeps a merged branch, or undefined. Its reflog may still reach commits the base does
 * not hold (the branch was reset onto a newer base after commits of its own): deleting the branch loses
 * the only way back to them. A branch nobody committed on yet (a worktree just made, a branch just cut)
 * is in use: its reflog holds nothing but its creation, or its tip is still the HEAD the worktree was
 * made at.
 */
function whyKeepByReflog(params: {
	root: string
	branch: string
	baseBranch: string
	/** The ref merged work is compared with (`findBaseRef`). */
	baseRef: string
	baselineHead: string | undefined
}): string | undefined {
	const { root, branch } = params
	const commits = [
		...new Set(
			readGit({ root, args: ['reflog', 'show', '--format=%H', `refs/heads/${branch}`, '--'] })
				.split('\n')
				.filter(Boolean),
		),
	]
	if (commits.length === 0) return 'nothing in its reflog'
	const unreached = Number(
		readGit({
			root,
			args: ['rev-list', '--count', ...commits, '--not', params.baseRef],
		}).trim(),
	)
	if (unreached > 0)
		return `its reflog still reaches ${unreached} commit(s) not in ${params.baseBranch}`
	const entries = readGit({
		root,
		args: ['reflog', 'show', '--format=%gs', `refs/heads/${branch}`, '--'],
	})
		.split('\n')
		.filter(Boolean)
	if (entries.length <= 1) return 'no commit of its own in its reflog'
	const tip = readGit({ root, args: ['rev-parse', `refs/heads/${branch}`] }).trim()
	return tip === params.baselineHead
		? 'no commit of its own since the worktree was made'
		: undefined
}

/**
 * Ignored files `git worktree remove` deletes with the worktree, beyond what is rebuilt or copied
 * (`node_modules`, `dist`, the hooks folder): local notes, logs, an `.env` someone keeps there.
 */
function listRemovableIgnored(worktree: string): string[] {
	const hooks = readHooksFolder(worktree).configured
	const rebuilt = [...REBUILT_IGNORED_FOLDERS, ...(hooks ? [`${hooks.replace(/\/$/, '')}/`] : [])]
	return readGit({
		root: worktree,
		args: [...WORKTREE_STATUS_ARGUMENTS, '--ignored=matching'],
	})
		.split('\n')
		.filter((line) => line.startsWith('!! '))
		.map((line) => line.slice(3))
		.filter((path) => !rebuilt.some((folder) => path === folder || path.startsWith(folder)))
		.filter((path) => !REBUILT_IGNORED_NAMES.some((name) => basename(path) === name))
		.sort()
}

function unmergedCount(params: { root: string; branch: string; baseRef: string }): number {
	return Number(
		readGit({
			root: params.root,
			args: ['rev-list', '--count', `${params.baseRef}..refs/heads/${params.branch}`],
		}).trim(),
	)
}

/** git answers real paths (`/private/var` for `/var` on macOS): a path under `folder` spelled as `folder` is. */
function spellUnder(params: { path: string; folder: string }): string {
	const realFolder = realpathSync(params.folder)
	return params.path.startsWith(`${realFolder}/`)
		? join(params.folder, params.path.slice(realFolder.length + 1))
		: params.path
}

/** The git folder every worktree of the repository `root` belongs to shares; undefined when `root` is in none. */
function commonFolderOf(root: string): string | undefined {
	if (!existsSync(root)) return undefined
	const common = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
		cwd: root,
		encoding: 'utf8',
	})
	return common.status === 0 ? common.stdout.trim() : undefined
}

function handoverStateOf(handover: HandoverFolder): string {
	return existsSync(handover.lotsFile.repository) ? handoverState(handover) : 'repository missing'
}

/**
 * One line of a reclaim plan: the action, the worktree under the workspace, then why it is kept or trashed and what
 * would move (`park  .worktrees/0002-cli-x  6 files, 1.2 kB`).
 *
 * @intent show every worktree's fate before anything moves
 * @internal
 */
export function reclaimItemLine(params: { item: ReclaimItem; workspace: string }): string {
	const { item } = params
	const name = relative(params.workspace, item.worktree) || item.worktree
	if (item.action === 'keep') return `keep  ${name}  ${item.reason ?? ''}`
	const counted = `${item.files} files, ${formatSize(item.bytes)}`
	return `${item.action}  ${name}  ${item.reason ? `${item.reason}; ` : ''}${counted}`
}

/**
 * The total of the items that move: `total: <n> worktrees, <n> files, <size>`.
 *
 * @intent say what a reclaim frees in one line
 * @internal
 */
export function reclaimTotalLine(items: readonly ReclaimItem[]): string {
	const moving = items.filter((item) => item.action !== 'keep')
	const files = moving.reduce((sum, item) => sum + item.files, 0)
	const bytes = moving.reduce((sum, item) => sum + item.bytes, 0)
	return `total: ${moving.length} worktrees, ${files} files, ${formatSize(bytes)}`
}

/** A size with its unit, each 1000 times the one before: `512 B`, `1.2 kB`, `340.5 MB`. */
function formatSize(bytes: number): string {
	let size = bytes
	let unit = 0
	while (size >= 1000 && unit < RECLAIM_SIZE_UNITS.length - 1) {
		size /= 1000
		unit++
	}
	return `${unit === 0 ? size : size.toFixed(1)} ${RECLAIM_SIZE_UNITS[unit]}`
}

/** What a reclaim reads once for the repository: files, and one `git worktree list`. */
function readReclaimContext(params: {
	repository: string
	workspace: string
	cutoff: Date
	processes: readonly ProcessFolder[] | string
	links: readonly FolderLink[]
}): ReclaimContext {
	const { repository } = params
	const location = locateStore({ from: repository })
	const mainLock = readPackageLockText({ worktree: repository })
	return {
		...params,
		mainLockKey: mainLock === undefined ? undefined : computeLockKey({ text: mainLock }),
		listed: listWorktrees(repository),
		// a failed lot keeps its worktree (the safer side), as prune's keep rule does
		lotKeeps: readLotKeeps({ repository }).kept,
		lotWorktrees: new Set(
			location === undefined
				? []
				: listLotIdentities({ store: location.store }).flatMap((entry) =>
						typeof entry.identity.worktree === 'string'
							? [realPathOf(entry.identity.worktree)]
							: [],
					),
		),
		handovers: location === undefined ? [] : readStoreEntries(location.registry),
		runs: readOwnedRuns(repository),
	}
}

/** The main checkout's item: always kept. */
function mainCheckoutItem(repository: string): ReclaimItem {
	return {
		repository,
		worktree: repository,
		action: 'keep',
		reason: RECLAIM_KEEP_REASONS.main,
		files: 0,
		bytes: 0,
	}
}

/**
 * The fate of one linked worktree: kept by the first keep rule that holds; else a `-round-<n>` throwaway of a closed
 * lot trashed whole (of an open one kept); else its node_modules parked or trashed.
 */
function decideReclaim(params: { listed: ListedWorktree; context: ReclaimContext }): ReclaimItem {
	const { context } = params
	const worktree = spellUnder({ path: params.listed.path, folder: dirname(context.repository) })
	const base = { repository: context.repository, worktree }
	const kept = whyKeepReclaimed({ listed: params.listed, worktree, context })
	if (kept !== undefined) return keepItemOf({ ...base, reason: kept })
	const round = roundOf({ worktree, context })
	if (round === 'closed') return { ...base, action: 'trash whole', ...countTree(worktree) }
	if (round !== undefined) return keepItemOf({ ...base, reason: round.open })
	return decideNodeModules({ ...base, mainLockKey: context.mainLockKey })
}

function keepItemOf(params: { repository: string; worktree: string; reason: string }): ReclaimItem {
	return { ...params, action: 'keep', files: 0, bytes: 0 }
}

/**
 * The first keep rule of the invariant that holds for the worktree, or undefined: not on disk, an open lot names it,
 * locked, a process or a mutation run works in it, a link reaches it, a hand-over runs in it or an open one names it,
 * git activity after the cutoff.
 */
function whyKeepReclaimed(params: {
	listed: ListedWorktree
	worktree: string
	context: ReclaimContext
}): string | undefined {
	const { worktree, context } = params
	if (!existsSync(worktree)) return RECLAIM_KEEP_REASONS.missing
	const lotKeep = context.lotKeeps.get(realPathOf(worktree))
	if (lotKeep !== undefined) return lotKeep
	if (params.listed.locked) return RECLAIM_KEEP_REASONS.locked
	const working = whyKeepByProcess({ worktree, processes: context.processes })
	if (working !== undefined) return working
	const run = mutationRunKeeping({ runs: context.runs, folder: worktree })
	if (run !== undefined) return run
	const reachedBy = linkReaching({ folder: worktree, links: context.links })
	if (reachedBy !== undefined) return RECLAIM_KEEP_REASONS.link.replace('{link}', reachedBy)
	if (existsSync(handoverLockPath(worktree))) return RECLAIM_KEEP_REASONS.handoverRunning
	return (
		whyKeepByHandover({ worktree, handovers: context.handovers }) ??
		whyKeepByActivity({ worktree, cutoff: context.cutoff, workspace: context.workspace })
	)
}

/** A process works in the worktree (its pid), or the processes are not known (why); undefined when none does. */
function whyKeepByProcess(params: {
	worktree: string
	processes: readonly ProcessFolder[] | string
}): string | undefined {
	if (typeof params.processes === 'string') return params.processes
	const working = processWorkingIn({ processes: params.processes, folder: params.worktree })
	return working && RECLAIM_KEEP_REASONS.process.replace('{pid}', String(working.pid))
}

/** An entry of the hand-over registry neither committed nor abandoned names the worktree: its name and state. */
function whyKeepByHandover(params: {
	worktree: string
	handovers: readonly StoreEntry[]
}): string | undefined {
	const real = realPathOf(params.worktree)
	const open = params.handovers.find(
		(entry) => entry.state === 'pending' && realPathOf(entry.worktree) === real,
	)
	return (
		open &&
		RECLAIM_KEEP_REASONS.handover.replace('{name}', open.name).replace('{state}', open.state)
	)
}

/**
 * The latest write after the cutoff of the worktree's index, HEAD or reflog, in its own git folder (read without git:
 * a status would refresh the index); undefined when none is that recent.
 */
function whyKeepByActivity(params: {
	worktree: string
	cutoff: Date
	workspace: string
}): string | undefined {
	const gitFolder = gitFolderAbove(params.worktree)
	if (gitFolder === undefined || !isDirectory(gitFolder)) return RECLAIM_KEEP_REASONS.noGitFolder
	const latest = RECLAIM_ACTIVITY_FILES.map((file) => join(gitFolder, file))
		.flatMap(function writtenAt(path) {
			try {
				return [{ path, at: statSync(path).mtime }]
			} catch {
				return []
			}
		})
		.filter((written) => written.at > params.cutoff)
		.sort((left, right) => right.at.getTime() - left.at.getTime())[0]
	if (latest === undefined) return undefined
	return RECLAIM_KEEP_REASONS.activity
		.replace('{file}', relative(params.workspace, latest.path))
		.replace('{at}', latest.at.toISOString())
}

/**
 * A `-round-<n>` throwaway's lot, found by the worktree its name continues (`<lot worktree>-round-<n>` beside it): open
 * (its keep reason), closed (a lot names it, none open), or undefined (no round, or no lot names that worktree).
 */
function roundOf(params: { worktree: string; context: ReclaimContext }): ReclaimRound | undefined {
	const lotFolderName = RECLAIM_ROUND_PATTERN.exec(basename(params.worktree))?.[1]
	if (lotFolderName === undefined) return undefined
	const lotWorktree = realPathOf(join(dirname(realPathOf(params.worktree)), lotFolderName))
	const open = params.context.lotKeeps.get(lotWorktree)
	if (open !== undefined)
		return { open: RECLAIM_KEEP_REASONS.roundOfOpenLot.replace('{lot}', open) }
	return params.context.lotWorktrees.has(lotWorktree) ? 'closed' : undefined
}

/**
 * An idle worktree's node_modules: kept when absent or a link (never followed); parked when its lock key is the main
 * checkout's and it installs that lock; else trashed with why.
 */
function decideNodeModules(params: {
	repository: string
	worktree: string
	mainLockKey: string | undefined
}): ReclaimItem {
	const base = { repository: params.repository, worktree: params.worktree }
	const nodeModules = join(params.worktree, 'node_modules')
	if (isLink(nodeModules))
		return keepItemOf({ ...base, reason: RECLAIM_KEEP_REASONS.nodeModulesLink })
	if (!isDirectory(nodeModules))
		return keepItemOf({ ...base, reason: RECLAIM_KEEP_REASONS.noNodeModules })
	const counted = countTree(nodeModules)
	const trashReason = whyTrashNodeModules(params)
	return trashReason === undefined
		? { ...base, action: 'park', ...counted }
		: { ...base, action: 'trash', reason: trashReason, ...counted }
}

/**
 * Why the worktree's node_modules cannot be parked: no lock, the main checkout has none, another lock key than the
 * main checkout's, or it does not install its lock; undefined when it parks.
 */
function whyTrashNodeModules(params: {
	worktree: string
	mainLockKey: string | undefined
}): string | undefined {
	const lockText = readPackageLockText({ worktree: params.worktree })
	if (lockText === undefined) return RECLAIM_TRASH_REASONS.noLock
	if (params.mainLockKey === undefined) return RECLAIM_TRASH_REASONS.mainNoLock
	const key = computeLockKey({ text: lockText })
	if (key !== params.mainLockKey)
		return RECLAIM_TRASH_REASONS.otherKey
			.replace('{key}', key.slice(0, POOL_MISS_KEY_LENGTH))
			.replace('{main}', params.mainLockKey.slice(0, POOL_MISS_KEY_LENGTH))
	const check = checkNodeModules({ worktree: params.worktree, lockText })
	if (check.notChecked !== undefined)
		return RECLAIM_TRASH_REASONS.notChecked.replace('{reason}', check.notChecked)
	if (check.problems.length === 0) return undefined
	return RECLAIM_TRASH_REASONS.differs.replace('{count}', String(check.problems.length)).replace(
		'{problems}',
		check.problems
			.slice(0, NODE_MODULES_PROBLEMS_SHOWN)
			.map((problem) => `${problem.package} ${problem.problem}`)
			.join(', '),
	)
}

/**
 * The files and links under `folder` (links never followed) and their size in bytes; what goes meanwhile (another
 * reclaim) is left out.
 */
function countTree(folder: string): { files: number; bytes: number } {
	let files = 0
	let bytes = 0
	const pending = [folder]
	for (let current = pending.pop(); current !== undefined; current = pending.pop())
		for (const entry of readEntries(current)) {
			const path = join(current, entry.name)
			if (entry.isDirectory()) pending.push(path)
			else {
				files++
				bytes += sizeOf(path)
			}
		}
	return { files, bytes }
}

/** The entries of `folder`; none when it is gone. */
function readEntries(folder: string): Dirent[] {
	try {
		return readdirSync(folder, { withFileTypes: true })
	} catch {
		return []
	}
}

/** The size of the file or link itself (never what a link points to); 0 when it is gone. */
function sizeOf(path: string): number {
	try {
		return lstatSync(path).size
	} catch {
		return 0
	}
}

/**
 * One planned move carried out: nothing when what it moves is gone (another reclaim) or a keep rule now holds (its
 * line says why), else the park, the trash or the whole worktree's trash; a move that throws is refused with its line.
 * The repository's context as the move left it: a worktree git forgot leaves its list.
 */
function moveReclaimItem(params: {
	item: ReclaimItem
	context: ReclaimContext
	/** How many pool entries the repository keeps; a park only. */
	cap: number | undefined
	now: Date
	spawner: BackgroundSpawner
}): { outcome: ReclaimOutcome; context: ReclaimContext } {
	const { item, context } = params
	const name = relative(context.workspace, item.worktree) || item.worktree
	function notMoved(why: string): { outcome: ReclaimOutcome; context: ReclaimContext } {
		return {
			outcome: { worktree: item.worktree, line: `kept  ${name}  ${why}`, moved: false },
			context,
		}
	}
	const whole = item.action === 'trash whole'
	if (!isPresent(whole ? item.worktree : join(item.worktree, 'node_modules')))
		return notMoved(whole ? RECLAIM_WORKTREE_GONE : RECLAIM_GONE)
	// read while the worktree is there: a folder gone has no real path to compare
	const real = realPathOf(item.worktree)
	const fresh = recheckReclaim({ item, context })
	if (fresh.action !== item.action)
		return notMoved(fresh.reason ?? `now ${fresh.action}, not ${item.action}: nothing done`)
	let moved: { done: string; to: string; forgotten?: boolean } | { refused: string }
	try {
		moved =
			item.action === 'park'
				? parkReclaimed({
						item,
						context,
						cap: params.cap,
						now: params.now,
						spawner: params.spawner,
					})
				: trashReclaimed({ item, context, now: params.now, spawner: params.spawner })
	} catch (error) {
		// a last resort: this item stops with its line, the next ones still run
		return {
			outcome: {
				worktree: item.worktree,
				line: `refused  ${name}  ${item.action}: ${(error as Error).message}; ${whereNowOf(item)}`,
				moved: false,
			},
			context,
		}
	}
	if ('refused' in moved) return notMoved(moved.refused)
	return {
		outcome: { worktree: item.worktree, line: `${moved.done}  ${name}  ${moved.to}`, moved: true },
		context: moved.forgotten
			? { ...context, listed: context.listed.filter((entry) => realPathOf(entry.path) !== real) }
			: context,
	}
}

/** Where what a move that threw was moving is now, as far as the worktree tells: still there, or gone from it. */
function whereNowOf(item: ReclaimItem): string {
	const unknown = 'where it went is unknown (see .worktrees/_pool-* and _trash/)'
	if (item.action === 'trash whole')
		return isPresent(item.worktree)
			? 'the worktree still in place'
			: `the worktree folder gone, ${unknown}`
	return isPresent(join(item.worktree, 'node_modules'))
		? 'node_modules still in place'
		: `node_modules no longer in the worktree, ${unknown}`
}

/**
 * The item decided again just before its move: the keep rules from `context` (read once per execution) with the facts
 * of this worktree read now (its lock, its git activity, a hand-over running in it); kept when git no longer lists
 * it. What its node_modules holds is not read again: a park checks it itself, a trash needs no check.
 */
function recheckReclaim(params: { item: ReclaimItem; context: ReclaimContext }): ReclaimItem {
	const { item, context } = params
	const base = { repository: item.repository, worktree: item.worktree }
	const real = realPathOf(item.worktree)
	const listed = context.listed.slice(1).find((entry) => realPathOf(entry.path) === real)
	if (listed === undefined)
		return keepItemOf({
			...base,
			reason: RECLAIM_KEEP_REASONS.unlisted.replace('{repository}', item.repository),
		})
	const locked = listed.locked === true || isLockedNow(item.worktree)
	const kept = whyKeepReclaimed({
		listed: { ...listed, ...(locked && { locked }) },
		worktree: item.worktree,
		context,
	})
	if (kept !== undefined) return keepItemOf({ ...base, reason: kept })
	const round = roundOf({ worktree: item.worktree, context })
	if (round === 'closed') return { ...item, action: 'trash whole' }
	if (round !== undefined) return keepItemOf({ ...base, reason: round.open })
	// no longer a closed lot's round: nothing planned for it now
	if (item.action === 'trash whole') return { ...base, action: 'keep', files: 0, bytes: 0 }
	if (isLink(join(item.worktree, 'node_modules')))
		return keepItemOf({ ...base, reason: RECLAIM_KEEP_REASONS.nodeModulesLink })
	return item
}

/** `git worktree lock` holds the worktree now: the lock file in its own git folder (read without git). */
function isLockedNow(worktree: string): boolean {
	const gitFolder = gitFolderAbove(worktree)
	return gitFolder !== undefined && existsSync(join(gitFolder, WORKTREE_LOCKED_FILE))
}

/** The worktree's node_modules saved into its repository's pool cache: where it went, or why not. */
function parkReclaimed(params: {
	item: ReclaimItem
	context: ReclaimContext
	cap: number | undefined
	now: Date
	spawner: BackgroundSpawner
}): { done: string; to: string } | { refused: string } {
	const { item } = params
	const worktreesFolder = join(params.context.workspace, WORKTREES_FOLDER)
	const saved = createPoolCache({
		repository: item.repository,
		worktreesFolder,
		spawner: params.spawner,
		cap: params.cap,
	}).save({
		checkout: item.worktree,
		lockText: readPackageLockText({ worktree: item.worktree }),
		now: params.now,
	})
	if ('refused' in saved) return saved
	const to = `node_modules -> ${relative(params.context.workspace, join(worktreesFolder, saved.parked))}`
	// the entry is whole: what failed after it (an eviction, the caches' trash) is said, the park stands
	return { done: 'parked', to: saved.note === undefined ? to : `${to}; ${saved.note}` }
}

/**
 * The worktree's node_modules (`trash`), or the whole worktree then forgotten by git (`trash whole`), renamed into the
 * trash: where it went, or why not (gone meanwhile, or another worktree git would forget with it).
 */
function trashReclaimed(params: {
	item: ReclaimItem
	context: ReclaimContext
	now: Date
	spawner: BackgroundSpawner
}): { done: string; to: string; forgotten?: boolean } | { refused: string } {
	const { item, context } = params
	const whole = item.action === 'trash whole'
	if (whole) {
		const prunable = otherPrunableOf({ item, context })
		if (prunable.length)
			return {
				refused: RECLAIM_KEEP_REASONS.otherPrunable.replace('{worktrees}', prunable.join(', ')),
			}
	}
	const worktreesFolder = join(context.workspace, WORKTREES_FOLDER)
	let trashed: string
	try {
		trashed = trashFolder({
			folder: whole ? item.worktree : join(item.worktree, 'node_modules'),
			worktreesFolder,
			now: params.now,
			spawner: params.spawner,
		}).trashed
	} catch (error) {
		return { refused: `${(error as Error).message}: nothing done` }
	}
	const to = relative(context.workspace, trashed)
	if (!whole) return { done: 'trashed', to: `node_modules -> ${to}` }
	// its folder is gone: git forgets it as prune does for a worktree deleted from disk
	try {
		readGit({ root: item.repository, args: ['worktree', 'prune'] })
	} catch (error) {
		return {
			done: 'trashed',
			to: `the worktree -> ${to}, still listed by git: ${(error as Error).message}`,
		}
	}
	return { done: 'trashed', to: `the worktree -> ${to}, forgotten by git`, forgotten: true }
}

/**
 * The other worktrees of the repository whose folder holds no checkout and that no lock protects: `git worktree
 * prune` would forget them too.
 */
function otherPrunableOf(params: { item: ReclaimItem; context: ReclaimContext }): string[] {
	const real = realPathOf(params.item.worktree)
	return params.context.listed
		.slice(1)
		.filter(
			(entry) =>
				!entry.locked && realPathOf(entry.path) !== real && !isPresent(join(entry.path, '.git')),
		)
		.map((entry) => entry.path)
}
