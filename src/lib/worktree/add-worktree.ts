/**
 * `dialecte worktree add`: a git worktree `.worktrees/<index>-<repository>-<branch tail>` of the workspace (the
 * index the next of the workspace's counter, or the one given), ready to work in - the
 * hooks folder of `core.hooksPath` copied (husky's `.husky/_` is ignored by git, so a new worktree misses
 * it and git skips every hook), `node_modules` taken from the workspace's pool when an entry matches the
 * worktree's `package-lock.json`, else copied on write with its links (from the worktree that has
 * the `--from` branch checked out when there is one, else from the main checkout), the links its `file:`
 * and `link:` dependencies need to reach sibling checkouts through `.worktrees/` (made before the copy),
 * that `node_modules` read against the worktree's `package-lock.json`, `.dialecte/` (the lot declaration,
 * never committed) in the repository's `.git/info/exclude`, and the hygiene baseline `gate --fast`
 * compares with.
 */
import { spawnSync } from 'node:child_process'
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'

import { readHooksFolder } from '../git-hooks.ts'
import { mainCheckoutOf, readGit } from '../git.ts'
import { readPackageJson } from '../package-json.ts'
import { WORKTREES_FOLDER } from '../workspace.constants.ts'
import { checkNodeModules } from './check-node-modules.ts'
import { copyNodeModules } from './copy-node-modules.ts'
import { writeHygieneBaseline } from './hygiene.ts'
import { readLockedPackages } from './locked-packages.ts'
import { takePooledNodeModules } from './node-modules-pool.ts'
import { linkSiblings } from './sibling-links.ts'
import { claimWorktreeIndex, worktreeFolderName } from './worktree-index.ts'
import {
	DEFAULT_BASE_BRANCH,
	LOT_FOLDER_EXCLUDE,
	REPOSITORY_NO_FOLDER,
	REPOSITORY_NO_GIT,
	WORKTREE_INDEX_FOLDER,
} from './worktree.constants.ts'

import type { AddedWorktree, ListedWorktree, NodeModulesSource } from './worktree.types.ts'

/**
 * Why `worktree add` cannot take the path as its repository: no folder there (a repository named from inside
 * itself), or a folder in no git repository; undefined when it is in one.
 */
export function refuseRepositoryPath(path: string): string | undefined {
	if (!existsSync(path) || !statSync(path).isDirectory())
		return REPOSITORY_NO_FOLDER.replace('{path}', path)
	try {
		readGit({ root: path, args: ['rev-parse', '--is-inside-work-tree'] })
		return undefined
	} catch {
		return REPOSITORY_NO_GIT.replace('{path}', path)
	}
}

/** The worktree made, or why it was not. */
export function addWorktree(params: {
	repository: string
	branch: string
	from?: string
	/** The index the folder takes (a review throwaway keeps its lot's); none: the next of the workspace. */
	index?: string
	now: Date
	/** Told the worktree's path once it is decided, before anything is made (a step records its start there). */
	onPlanned?: (worktree: string) => void
}): AddedWorktree | string {
	const { branch } = params
	const repository = mainCheckoutOf(params.repository)
	const branchExists =
		spawnSync('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], {
			cwd: repository,
		}).status === 0
	// the refusals that need no folder come before the claim: a refused add takes no number
	if (branchExists && params.from)
		return `${branch} exists already: --from only starts a new branch`
	const worktreesFolder = join(dirname(repository), WORKTREES_FOLDER)
	const claims = join(worktreesFolder, WORKTREE_INDEX_FOLDER)
	if (params.index === undefined && existsSync(claims) && !statSync(claims).isDirectory())
		return `${claims} is not a folder: it holds the claims of the worktree index, move it away`
	const index = params.index ?? claimWorktreeIndex({ worktreesFolder })
	const worktree = join(worktreesFolder, worktreeFolderName({ index, repository, branch }))
	if (existsSync(worktree)) return `${worktree} exists already`
	params.onPlanned?.(worktree)
	const from = branchExists
		? branch
		: (params.from ?? readPackageJson(repository).dialecte?.baseBranch ?? DEFAULT_BASE_BRANCH)
	readGit({
		root: repository,
		args: branchExists
			? ['worktree', 'add', '--quiet', worktree, branch]
			: ['worktree', 'add', '--quiet', '-b', branch, worktree, from],
	})

	const hooks = readHooksFolder(repository)
	let copiedHooks: string | undefined
	if (hooks.configured && !isAbsolute(hooks.configured) && existsSync(hooks.folder)) {
		const target = join(worktree, hooks.configured)
		if (!existsSync(target)) cpSync(hooks.folder, target, { recursive: true })
		copiedHooks = hooks.configured
	}
	excludeLotFolder(worktree)
	// the copied links and `npm ci` reach sibling checkouts through these
	const siblingLinks = linkSiblings({ worktree, repository })
	const checkout = params.from ? checkoutOf({ repository, branch: params.from }) : undefined
	// that worktree's own node_modules when it has one on disk, else the main checkout's
	const nodeModules =
		[checkout, repository]
			.filter((folder): folder is string => folder !== undefined)
			.map((folder) => join(folder, 'node_modules'))
			.find((folder) => existsSync(folder)) ?? join(repository, 'node_modules')
	const provided = provideNodeModules({
		checkout: worktree,
		repository,
		worktreesFolder,
		from: nodeModules,
	})
	const nodeModulesCheck = checkNodeModules({ worktree })
	const lockfileRead = readLockedPackages({ worktree })
	const lockedPackages = 'packages' in lockfileRead ? lockfileRead.packages.length : 0
	const baseline = writeHygieneBaseline({ root: worktree, now: params.now })
	return {
		repository,
		worktree,
		index,
		branch,
		from,
		head: baseline.head,
		hooks: copiedHooks,
		nodeModules: provided,
		siblingLinks,
		nodeModulesCheck,
		lockedPackages,
		baseline,
	}
}

/** The folder of the worktree that has `branch` checked out (the main checkout included); none when no worktree has. */
export function checkoutOf(params: { repository: string; branch: string }): string | undefined {
	return listWorktrees(params.repository).find((worktree) => worktree.branch === params.branch)
		?.path
}

/**
 * The worktrees of the repository, the main checkout first, each with its branch (none when detached) and
 * whether `git worktree lock` locked it.
 */
export function listWorktrees(repository: string): ListedWorktree[] {
	const blocks = readGit({ root: repository, args: ['worktree', 'list', '--porcelain'] }).split(
		'\n\n',
	)
	return blocks.filter(Boolean).map(function parse(block): ListedWorktree {
		const lines = block.split('\n')
		const path = lines.find((line) => line.startsWith('worktree '))?.slice('worktree '.length) ?? ''
		const branch = lines
			.find((line) => line.startsWith('branch refs/heads/'))
			?.slice('branch refs/heads/'.length)
		const locked = lines.some((line) => line === 'locked' || line.startsWith('locked '))
		return { path, ...(branch && { branch }), ...(locked && { locked }) }
	})
}

/**
 * The `node_modules` of a new checkout: the newest pool entry whose lockfile matches (a rename), else a copy of
 * `from` when it exists (copy-on-write where it can); how long it took.
 */
export function provideNodeModules(params: {
	checkout: string
	/** The repository's main checkout. */
	repository: string
	/** Where the pool is; none: no pool, a copy. */
	worktreesFolder: string | undefined
	/** The `node_modules` copied when the pool has none. */
	from: string
}): NodeModulesSource | undefined {
	const startedAt = performance.now()
	const take = params.worktreesFolder
		? takePooledNodeModules({
				worktree: params.checkout,
				repository: params.repository,
				worktreesFolder: params.worktreesFolder,
			})
		: undefined
	if (take && 'taken' in take)
		return { method: 'pooled', from: take.taken, seconds: secondsSince(startedAt) }
	if (!existsSync(params.from)) return undefined
	const copy = copyNodeModules({ from: params.from, to: join(params.checkout, 'node_modules') })
	return { ...copy, seconds: secondsSince(startedAt) }
}

/** Seconds since `startedAt` (`performance.now()`), to one decimal. */
function secondsSince(startedAt: number): number {
	return Math.round((performance.now() - startedAt) / 100) / 10
}

/** `.dialecte/` in the repository's exclude file (shared by its worktrees), listed once. */
function excludeLotFolder(worktree: string): void {
	const exclude = readGit({
		root: worktree,
		args: ['rev-parse', '--path-format=absolute', '--git-path', 'info/exclude'],
	}).trim()
	const text = existsSync(exclude) ? readFileSync(exclude, 'utf8') : ''
	if (text.split('\n').includes(LOT_FOLDER_EXCLUDE)) return
	mkdirSync(dirname(exclude), { recursive: true })
	appendFileSync(exclude, `${text && !text.endsWith('\n') ? '\n' : ''}${LOT_FOLDER_EXCLUDE}\n`)
}
