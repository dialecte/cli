/**
 * `dialecte worktree add`: a git worktree under the workspace's `.worktrees/`, ready to work in - the
 * hooks folder of `core.hooksPath` copied (husky's `.husky/_` is ignored by git, so a new worktree misses
 * it and git skips every hook), `node_modules` copied on write with its links (from the worktree that has
 * the `--from` branch checked out when there is one, else from the main checkout), `.dialecte/` (the lot
 * declaration, never committed) in the repository's `.git/info/exclude`, and the hygiene baseline
 * `gate --fast` compares with.
 */
import { spawnSync } from 'node:child_process'
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join } from 'node:path'

import { readHooksFolder } from '../git-hooks.ts'
import { mainCheckoutOf, readGit } from '../git.ts'
import { readPackageJson } from '../package-json.ts'
import { WORKTREES_FOLDER } from '../workspace.constants.ts'
import { copyNodeModules } from './copy-node-modules.ts'
import { writeHygieneBaseline } from './hygiene.ts'
import { DEFAULT_BASE_BRANCH, LOT_FOLDER_EXCLUDE } from './worktree.constants.ts'

import type { AddedWorktree } from './worktree.types.ts'

/** The worktree made, or why it was not. */
export function addWorktree(params: {
	repository: string
	branch: string
	from?: string
	now: Date
}): AddedWorktree | string {
	const { branch } = params
	const repository = mainCheckoutOf(params.repository)
	const worktree = join(
		dirname(repository),
		WORKTREES_FOLDER,
		`${basename(repository)}-${branch.split('/').at(-1)}`,
	)
	if (existsSync(worktree)) return `${worktree} exists already`
	const branchExists =
		spawnSync('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], {
			cwd: repository,
		}).status === 0
	if (branchExists && params.from)
		return `${branch} exists already: --from only starts a new branch`
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
	const checkout = params.from ? checkoutOf({ repository, branch: params.from }) : undefined
	// that worktree's own node_modules when it has one on disk, else the main checkout's
	const nodeModules =
		[checkout, repository]
			.filter((folder): folder is string => folder !== undefined)
			.map((folder) => join(folder, 'node_modules'))
			.find((folder) => existsSync(folder)) ?? join(repository, 'node_modules')
	const copy = existsSync(nodeModules)
		? copyNodeModules({ from: nodeModules, to: join(worktree, 'node_modules') })
		: undefined
	const baseline = writeHygieneBaseline({ root: worktree, now: params.now })
	return {
		repository,
		worktree,
		branch,
		from,
		head: baseline.head,
		hooks: copiedHooks,
		nodeModules: copy,
		baseline,
	}
}

/** The folder of the worktree that has `branch` checked out (the main checkout included); none when no worktree has. */
function checkoutOf(params: { repository: string; branch: string }): string | undefined {
	let path: string | undefined
	for (const line of readGit({
		root: params.repository,
		args: ['worktree', 'list', '--porcelain'],
	}).split('\n')) {
		if (line.startsWith('worktree ')) path = line.slice('worktree '.length)
		else if (line === `branch refs/heads/${params.branch}`) return path
	}
	return undefined
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
