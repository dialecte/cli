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

import { isAtOrInside, realPathOf } from '../file-system.ts'
import { readHooksFolder } from '../git-hooks.ts'
import { readGit } from '../git.ts'
import { handoverLockPath } from '../handover/handover-lock.ts'
import { REHEARSAL_FOLDER_PREFIX, REHEARSAL_MARKER_FILE } from '../handover/handover.constants.ts'
import { handoverState } from '../handover/list-handovers.ts'
import { readHandoverFolder } from '../handover/read-handover-folder.ts'
import { diedRunLine, runningLine } from '../mutation/pending-verdict.ts'
import { readRuns } from '../mutation/run-store.ts'
import { readPackageJson } from '../package-json.ts'
import { isProcessAlive } from '../process-alive.ts'
import { shellQuote } from '../shell-quote.ts'
import { lotsKeepingWorktrees } from '../store/lot-keep.ts'
import { COMMIT_PLAN_FOLDER, WORKTREES_FOLDER } from '../workspace.constants.ts'
import { listWorktrees } from './add-worktree.ts'
import { readHygieneBaseline } from './hygiene.ts'
import { listPoolEntries } from './node-modules-pool.ts'
import { isParked } from './trash.ts'
import {
	DEFAULT_BASE_BRANCH,
	IGNORED_FILES_SHOWN,
	PRUNE_LINK_REASON,
	PRUNE_RUN_PREFIX,
	REBUILT_IGNORED_FOLDERS,
	REBUILT_IGNORED_NAMES,
	POOL_ENTRY_PATTERN,
	POOL_FILE,
	TRASH_FOLDER,
	WORKTREE_STATUS_ARGUMENTS,
} from './worktree.constants.ts'

import type { HandoverFolder } from '../handover/handover.types.ts'
import type { RunEntry } from '../mutation/mutation.types.ts'
import type {
	FolderLink,
	PruneHandover,
	PruneItem,
	PrunePlan,
	WorkspacePrunePlan,
} from './worktree.types.ts'

export function planPrune(params: {
	workspace: string
	/** Hand-over folders found under the workspace's `_commit-plan`. */
	handoverFolders: readonly string[]
	/** Where rehearsal folders are made. */
	scratchRoot: string
	/** Where earlier cli versions made rehearsal clones, looked in too when it is not `scratchRoot`. */
	formerScratchRoot?: string
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
		poolLeftOver: listPoolLeftOver(worktreesFolder),
		trash: countTrashed(worktreesFolder),
	}
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

/** The `_pool-*` folders without a `pool.json`: a park that never finished, never taken nor evicted. */
function listPoolLeftOver(worktreesFolder: string): string[] {
	if (!isDirectory(worktreesFolder)) return []
	return readdirSync(worktreesFolder)
		.filter(
			(name) =>
				POOL_ENTRY_PATTERN.test(name) && !existsSync(join(worktreesFolder, name, POOL_FILE)),
		)
		.sort()
		.map((name) => join(worktreesFolder, name))
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
	const baseBranch = readPackageJson(repository).dialecte?.baseBranch ?? DEFAULT_BASE_BRANCH
	if (!refExists({ root: repository, ref: `refs/heads/${baseBranch}` }))
		return { repository, baseBranch, items: [], skipped: `no local branch ${baseBranch}` }
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
		const unmerged = unmergedCount({ root: repository, branch, baseBranch })
		if (unmerged > 0) continue
		if (pendingBranches.has(branch)) {
			items.push({ kind: 'branch', name: branch, kept: 'a hand-over is pending on it' })
			continue
		}
		const keptByReflog = whyKeepByReflog({
			root: repository,
			branch,
			baseBranch,
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
		baseBranch: params.baseBranch,
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
			args: ['rev-list', '--count', ...commits, '--not', `refs/heads/${params.baseBranch}`],
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

function unmergedCount(params: { root: string; branch: string; baseBranch: string }): number {
	return Number(
		readGit({
			root: params.root,
			args: ['rev-list', '--count', `${params.baseBranch}..refs/heads/${params.branch}`],
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

function refExists(params: { root: string; ref: string }): boolean {
	return (
		spawnSync('git', ['rev-parse', '--verify', '--quiet', params.ref], { cwd: params.root })
			.status === 0
	)
}
