/**
 * `dialecte worktree prune`: per repository of the workspace, the worktrees and local branches whose
 * commits are all in the base branch, the hand-over folders already committed, and the rehearsal clones
 * left behind - each with the command that removes it, with its absolute `cd`. Never an unmerged branch,
 * a dirty worktree, or one a pending hand-over commits in; never a symbolic link (the sibling link
 * `.worktrees/core -> ../core` among them) nor a folder a link reaches.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path'

import { readHooksFolder } from '../git-hooks.ts'
import { readGit } from '../git.ts'
import { handoverLockPath } from '../handover/handover-lock.ts'
import { REHEARSAL_FOLDER_PREFIX, REHEARSAL_MARKER_FILE } from '../handover/handover.constants.ts'
import { handoverState } from '../handover/list-handovers.ts'
import { readHandoverFolder } from '../handover/read-handover-folder.ts'
import { readPackageJson } from '../package-json.ts'
import { isProcessAlive } from '../process-alive.ts'
import { shellQuote } from '../shell-quote.ts'
import { COMMIT_PLAN_FOLDER, WORKTREES_FOLDER } from '../workspace.constants.ts'
import { readHygieneBaseline } from './hygiene.ts'
import {
	DEFAULT_BASE_BRANCH,
	IGNORED_FILES_SHOWN,
	PRUNE_LINK_REASON,
	REBUILT_IGNORED_FOLDERS,
	REBUILT_IGNORED_NAMES,
} from './worktree.constants.ts'

import type { HandoverFolder } from '../handover/handover.types.ts'
import type { FolderLink, PruneItem, PrunePlan, WorkspacePrunePlan } from './worktree.types.ts'

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
	const handovers = params.handoverFolders.flatMap(function read(folder): HandoverFolder[] {
		const handover = readHandoverFolder(folder)
		return typeof handover === 'string' ? [] : [handover]
	})
	const links = [
		params.workspace,
		join(params.workspace, WORKTREES_FOLDER),
		join(params.workspace, COMMIT_PLAN_FOLDER),
		...scratchRoots,
	].flatMap((folder) => findLinks(folder))
	const repositories = readdirSync(params.workspace, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && isMainCheckout(join(params.workspace, entry.name)))
		.map((entry) =>
			planRepository({ repository: join(params.workspace, entry.name), handovers, links }),
		)
	const scratch = scratchRoots.flatMap(function rehearsalsIn(scratchRoot) {
		if (!existsSync(scratchRoot)) return []
		return readdirSync(scratchRoot)
			.filter((name) => name.startsWith(REHEARSAL_FOLDER_PREFIX))
			.sort()
			.map((name) => planRehearsalClone({ scratchRoot, name, links }))
	})
	return { repositories, scratch }
}

function planRepository(params: {
	repository: string
	handovers: readonly HandoverFolder[]
	/** The links found around the workspace: what they reach is kept. */
	links: readonly FolderLink[]
}): PrunePlan {
	const { repository } = params
	const baseBranch = readPackageJson(repository).dialecte?.baseBranch ?? DEFAULT_BASE_BRANCH
	if (!refExists({ root: repository, ref: `refs/heads/${baseBranch}` }))
		return { repository, baseBranch, items: [], skipped: `no local branch ${baseBranch}` }
	const cd = `cd ${shellQuote(repository)} &&`
	const mine = params.handovers.filter((handover) =>
		isSameRepository({ repository, worktree: handover.lotsFile.repository }),
	)
	const pendingWorktrees = new Set(
		mine
			.filter(
				(handover) => !['committed', 'repository missing'].includes(handoverStateOf(handover)),
			)
			.map((handover) => realpathSync(handover.lotsFile.repository)),
	)
	const pendingBranches = new Set(
		mine
			.filter((handover) => handoverStateOf(handover) !== 'committed')
			.map((handover) => handover.lotsFile.branch),
	)

	const items: PruneItem[] = []
	// the branch the main checkout is on stays, merged or not
	const checkedOut = readGit({
		root: repository,
		args: ['rev-parse', '--abbrev-ref', 'HEAD'],
	}).trim()
	const keptBranches = new Set<string>([baseBranch, checkedOut])
	const worktrees = listWorktrees(repository)
		.slice(1)
		.map((worktree) => ({
			...worktree,
			name: spellUnder({ path: worktree.path, folder: dirname(repository) }),
		}))
	// `git worktree prune` unregisters every worktree whose folder holds no checkout: a link's too, when
	// what it points to holds no `.git`
	const linkedWorktrees = worktrees
		.map((worktree) => worktree.name)
		.filter((name) => isLink(name) && !existsSync(join(name, '.git')))
	for (const worktree of worktrees) {
		const { name } = worktree
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
		if (handoverStateOf(handover) !== 'committed') continue
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
function findLinks(folder: string): FolderLink[] {
	if (!existsSync(folder)) return []
	return readdirSync(folder, { withFileTypes: true })
		.filter((entry) => entry.isSymbolicLink())
		.flatMap(function reach(entry): FolderLink[] {
			const link = join(folder, entry.name)
			try {
				return [{ link, target: realpathSync(link) }]
			} catch {
				return []
			}
		})
}

/** A link that reaches the folder or something inside it: removing the folder would break it. */
function linkReaching(params: {
	folder: string
	links: readonly FolderLink[]
}): string | undefined {
	const real = realpathSync(params.folder)
	return params.links.find(function reaches(link) {
		const fromFolder = relative(real, link.target)
		return (
			fromFolder === '' ||
			(fromFolder !== '..' && !fromFolder.startsWith(`..${sep}`) && !isAbsolute(fromFolder))
		)
	})?.link
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
}): string | undefined {
	const reachedBy = linkReaching({ folder: params.worktree, links: params.links })
	if (reachedBy) return `the link ${reachedBy} points to it`
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
			args: ['--no-optional-locks', 'status', '--porcelain'],
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
		args: ['--no-optional-locks', 'status', '--porcelain', '--ignored=matching'],
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

function listWorktrees(repository: string): { path: string; branch?: string }[] {
	const blocks = readGit({ root: repository, args: ['worktree', 'list', '--porcelain'] }).split(
		'\n\n',
	)
	return blocks.filter(Boolean).map(function parse(block) {
		const lines = block.split('\n')
		const path = lines.find((line) => line.startsWith('worktree '))?.slice('worktree '.length) ?? ''
		const branch = lines
			.find((line) => line.startsWith('branch refs/heads/'))
			?.slice('branch refs/heads/'.length)
		return { path, ...(branch && { branch }) }
	})
}

/** git answers real paths (`/private/var` for `/var` on macOS): a path under `folder` spelled as `folder` is. */
function spellUnder(params: { path: string; folder: string }): string {
	const realFolder = realpathSync(params.folder)
	return params.path.startsWith(`${realFolder}/`)
		? join(params.folder, params.path.slice(realFolder.length + 1))
		: params.path
}

function isSameRepository(params: { repository: string; worktree: string }): boolean {
	if (!existsSync(params.worktree)) return false
	const common = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
		cwd: params.worktree,
		encoding: 'utf8',
	})
	if (common.status !== 0) return false
	const mainCommon = readGit({
		root: params.repository,
		args: ['rev-parse', '--path-format=absolute', '--git-common-dir'],
	}).trim()
	return common.stdout.trim() === mainCommon
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
