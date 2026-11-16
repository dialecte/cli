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
import {
	appendFileSync,
	cpSync,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	statSync,
} from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'

import { isPresent } from '../file-system.ts'
import { ORIGIN_BRANCH_REF_PREFIX } from '../gate/gate-base.constants.ts'
import { findBaseBranchRef } from '../gate/gate-base.ts'
import { readHooksFolder } from '../git-hooks.ts'
import { fetchOrigin, mainCheckoutOf, readGit } from '../git.ts'
import { readPackageJson } from '../package-json.ts'
import { WORKTREES_FOLDER } from '../workspace.constants.ts'
import { checkNodeModules } from './check-node-modules.ts'
import { copyNodeModules } from './copy-node-modules.ts'
import { writeHygieneBaseline } from './hygiene.ts'
import { readLockedPackages } from './locked-packages.ts'
import { createPoolCache, noEntryMissOf, readPackageLockText } from './node-modules-pool.ts'
import { runNpm } from './npm-runner.ts'
import { linkSiblings } from './sibling-links.ts'
import { spawnDetached, trashFolder } from './trash.ts'
import { claimWorktreeIndex, worktreeFolderName } from './worktree-index.ts'
import {
	CHECKOUT_DISCARD_FOLDER,
	COPY_REASON_DETAIL,
	DISCARDED_NODE_MODULES_PREFIX,
	INSTALLED_DETAIL,
	LOT_FOLDER_EXCLUDE,
	MISSED_INSTALLED_DETAIL,
	NEAR_CHECK_FAILURE,
	NEAR_DETAIL,
	NEAR_NOT_CHECKED,
	NPM_CI_ARGS,
	NPM_NEAR_INSTALL_ARGS,
	NPM_SILENT_FAILURE,
	REPOSITORY_NO_FOLDER,
	REPOSITORY_NO_GIT,
	WORKTREE_INDEX_FOLDER,
} from './worktree.constants.ts'

import type { InterleavingSeam } from '../handover/handover.types.ts'
import type { Refusal } from '../refusal.types.ts'
import type {
	AddedWorktree,
	BackgroundSpawner,
	ListedWorktree,
	NearAttempt,
	NewBranchStart,
	NodeModulesCheck,
	NodeModulesSource,
	NpmRunner,
} from './worktree.types.ts'

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
	/** Runs `npm install` / `npm ci` in the new worktree (the tests stand in for it); default: spawns `npm`. */
	install?: NpmRunner
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
	const start = branchExists ? undefined : newBranchStart({ repository, from: params.from })
	if (start !== undefined && 'refusal' in start) return start.refusal
	const worktreesFolder = join(dirname(repository), WORKTREES_FOLDER)
	const claims = join(worktreesFolder, WORKTREE_INDEX_FOLDER)
	if (params.index === undefined && existsSync(claims) && !statSync(claims).isDirectory())
		return `${claims} is not a folder: it holds the claims of the worktree index, move it away`
	const index = params.index ?? claimWorktreeIndex({ worktreesFolder })
	const worktree = join(worktreesFolder, worktreeFolderName({ index, repository, branch }))
	if (existsSync(worktree)) return `${worktree} exists already`
	params.onPlanned?.(worktree)
	readGit({
		root: repository,
		args: start
			? ['worktree', 'add', '--quiet', ...start.options, '-b', branch, worktree, start.ref]
			: ['worktree', 'add', '--quiet', worktree, branch],
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
		install: params.install,
		now: params.now,
	})
	const nodeModulesCheck = checkNodeModules({ worktree })
	const lockfileRead = readLockedPackages({ worktree })
	const lockedPackages = 'packages' in lockfileRead ? lockfileRead.packages.length : 0
	// an existing branch checked out has no start: no branch it was cut from is known
	const baseline = writeHygieneBaseline({
		root: worktree,
		now: params.now,
		...(start !== undefined && { from: start.name }),
	})
	return {
		repository,
		worktree,
		index,
		branch,
		from: start ? start.name : branch,
		...(start?.fetchProblem !== undefined && { fetchProblem: start.fetchProblem }),
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
 * The `node_modules` of a new checkout, in one order for every repository: the newest pool entry with the lock key of
 * the checkout's lock (a rename); else the nearest entry, completed by `npm install --prefer-offline --no-save` and
 * checked (a failure sends it to the trash); else `npm ci --prefer-offline`; else, when npm ci fails, a copy of `from`
 * when it exists (copy-on-write where it can) carrying why. A source after a miss says why the pool gave nothing; how
 * long it took.
 */
export function provideNodeModules(params: {
	checkout: string
	/** The repository's main checkout. */
	repository: string
	/** Where the pool is; none: no pool, `npm ci`. */
	worktreesFolder: string | undefined
	/** The `node_modules` copied when `npm ci` fails. */
	from: string
	/** Renames a pool entry into the checkout (the tests stand in for it); default: `fs.renameSync`. */
	rename?: (params: { from: string; to: string }) => void
	/** Called between the pick of a pool entry and its rename. */
	afterPick?: InterleavingSeam
	/** Runs `npm install` / `npm ci` in the checkout (the tests stand in for it); default: `runNpm`. */
	install?: NpmRunner
	/** Starts the background removal of a near entry sent to the trash; default: `spawnDetached`. */
	spawner?: BackgroundSpawner
	/** When a near entry given up goes to the trash (its trash name); default: now. */
	now?: Date
	/**
	 * A folder already on its way out (a rehearsal folder): what a failed `npm ci` left in `node_modules` is renamed into
	 * it. None: into the pool's trash, or with no pool the checkout's own `.dialecte/`.
	 */
	discardInto?: string
}): NodeModulesSource | undefined {
	const startedAt = performance.now()
	const install = params.install ?? runNpm
	const spawner = params.spawner ?? spawnDetached
	// keyed on the checkout's own lock, never the repository's: the checkout installs what it locks
	const lockText = readPackageLockText({ worktree: params.checkout })
	const restored =
		params.worktreesFolder !== undefined && lockText !== undefined
			? createPoolCache({
					repository: params.repository,
					worktreesFolder: params.worktreesFolder,
					spawner,
					rename: params.rename,
					afterPick: params.afterPick,
				}).restore({ checkout: params.checkout, lockText })
			: undefined
	if (restored && 'taken' in restored)
		return { method: 'pooled', from: restored.taken, seconds: secondsSince(startedAt) }
	const near =
		restored && 'near' in restored && params.worktreesFolder !== undefined && lockText !== undefined
			? completeNearEntry({
					checkout: params.checkout,
					lockText,
					from: restored.near,
					drift: restored.drift,
					install,
					trash: {
						worktreesFolder: params.worktreesFolder,
						now: params.now ?? new Date(),
						spawner,
					},
				})
			: undefined
	if (near && 'method' in near) return { ...near, seconds: secondsSince(startedAt) }
	// a near entry given up is a miss all the same: the one a restore names when no entry is near
	const miss =
		restored && 'miss' in restored
			? restored.miss
			: near && lockText !== undefined
				? noEntryMissOf({ lockText })
				: undefined
	const missed = { ...(miss !== undefined && { miss }), ...(near && { near }) }
	// npm ci installs a lock: without one, only the copy
	const ci =
		lockText === undefined
			? undefined
			: install({ checkout: params.checkout, args: [...NPM_CI_ARGS] })
	if (ci?.status === 0) return { method: 'installed', seconds: secondsSince(startedAt), ...missed }
	if (ci)
		clearFailedInstall({
			checkout: params.checkout,
			worktreesFolder: params.worktreesFolder,
			discardInto: params.discardInto,
			spawner,
			now: params.now,
		})
	if (!existsSync(params.from)) return undefined
	const copy = copyNodeModules({ from: params.from, to: join(params.checkout, 'node_modules') })
	return {
		...copy,
		seconds: secondsSince(startedAt),
		...missed,
		...(ci && { reason: firstLineOf(ci) }),
	}
}

/**
 * What a `node_modules` source says after its method: the entry (`_pool-cli-1`), the near entry and its drift
 * (`_pool-cli-1, 1 package(s) differ`), the install and its miss (`npm ci (pool empty)`), why npm ci did not install
 * before a copy (`npm ci failed: <its first line>`); empty for a copy npm never ran before.
 *
 * @intent say on the card and in a rehearsal where node_modules came from and why the pool gave nothing
 * @internal
 */
export function nodeModulesDetailOf(source: NodeModulesSource): string {
	switch (source.method) {
		case 'pooled':
			return source.from
		case 'near':
			return NEAR_DETAIL.replace('{from}', source.from).replace('{drift}', String(source.drift))
		case 'installed':
			return source.miss === undefined
				? INSTALLED_DETAIL
				: MISSED_INSTALLED_DETAIL.replace('{miss}', source.miss)
		default:
			return source.reason === undefined
				? ''
				: COPY_REASON_DETAIL.replace('{reason}', source.reason)
	}
}

/**
 * The near pool entry renamed into `checkout` completed by `npm install --prefer-offline --no-save` and read against
 * `lockText`: the near source when both pass, else that `node_modules` sent to the trash and the attempt with why.
 */
function completeNearEntry(params: {
	checkout: string
	lockText: string
	/** The pool entry taken. */
	from: string
	drift: number
	install: NpmRunner
	trash: { worktreesFolder: string; now: Date; spawner: BackgroundSpawner }
}): { method: 'near'; from: string; drift: number } | NearAttempt {
	const { checkout, from, drift } = params
	const ran = params.install({ checkout, args: [...NPM_NEAR_INSTALL_ARGS] })
	const reason =
		ran.status === 0
			? checkFailureOf(checkNodeModules({ worktree: checkout, lockText: params.lockText }))
			: firstLineOf(ran)
	if (reason === undefined) return { method: 'near', from, drift }
	const nodeModules = join(checkout, 'node_modules')
	if (isPresent(nodeModules)) trashFolder({ folder: nodeModules, ...params.trash })
	return { from, drift, reason }
}

/**
 * What a failed `npm ci` left in `checkout` moved away before the copy, never deleted here: renamed into `discardInto`
 * (a folder already on its way out), else sent to the trash of `worktreesFolder`, else renamed into the checkout's own
 * `.dialecte/` as `discarded-node_modules-<n>`.
 */
function clearFailedInstall(params: {
	checkout: string
	worktreesFolder: string | undefined
	discardInto: string | undefined
	spawner: BackgroundSpawner
	now: Date | undefined
}): void {
	const nodeModules = join(params.checkout, 'node_modules')
	if (!isPresent(nodeModules)) return
	if (params.discardInto === undefined && params.worktreesFolder !== undefined) {
		trashFolder({
			folder: nodeModules,
			worktreesFolder: params.worktreesFolder,
			now: params.now ?? new Date(),
			spawner: params.spawner,
		})
		return
	}
	const folder = params.discardInto ?? join(params.checkout, CHECKOUT_DISCARD_FOLDER)
	mkdirSync(folder, { recursive: true })
	renameSync(nodeModules, freeDiscardPathIn(folder))
}

/** The first `discarded-node_modules-<n>` in `folder` nothing holds yet (n from 1). */
function freeDiscardPathIn(folder: string): string {
	for (let number = 1; ; number++) {
		const path = join(folder, `${DISCARDED_NODE_MODULES_PREFIX}${number}`)
		if (!isPresent(path)) return path
	}
}

/** Why the check of a completed near entry fails: the first package that still differs; undefined when it passes. */
function checkFailureOf(check: NodeModulesCheck): string | undefined {
	if (check.notChecked) return NEAR_NOT_CHECKED.replace('{reason}', check.notChecked)
	const [first] = check.problems
	if (first === undefined) return undefined
	return NEAR_CHECK_FAILURE.replace('{count}', String(check.problems.length))
		.replace('{package}', first.package)
		.replace('{problem}', first.problem)
}

/** The first line npm printed (its reason), or its exit status when it printed nothing. */
function firstLineOf(ran: ReturnType<NpmRunner>): string {
	return (
		ran.output
			.split('\n')
			.map((line) => line.trim())
			.find((line) => line.length > 0) ?? NPM_SILENT_FAILURE.replace('{status}', String(ran.status))
	)
}

/**
 * Where a new branch starts: `from` as given, else the base branch's ref (`findBaseBranchRef`) once origin is fetched
 * (the queue lands on the host: a local base branch may be behind it), which may be origin's and is then never
 * tracked; the resolver's refusal when there is neither. A fetch that fails says so and the last known refs are read.
 */
function newBranchStart(params: {
	repository: string
	from: string | undefined
}): NewBranchStart | Refusal {
	if (params.from !== undefined) return { ref: params.from, name: params.from, options: [] }
	const fetchProblem = fetchOrigin({ root: params.repository })
	const found = findBaseBranchRef({
		root: params.repository,
		packageJson: readPackageJson(params.repository),
	})
	if ('refusal' in found) return found
	const onOrigin = found.ref.startsWith(ORIGIN_BRANCH_REF_PREFIX)
	return {
		ref: found.ref,
		name: onOrigin ? `origin/${found.branch}` : found.branch,
		options: ['--no-track'],
		...(fetchProblem !== undefined && { fetchProblem }),
	}
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
