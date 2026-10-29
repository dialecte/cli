/**
 * `dialecte worktree add`: a git worktree under the workspace's `.worktrees/`, ready to work in - the
 * hooks folder of `core.hooksPath` copied (husky's `.husky/_` is ignored by git, so a new worktree misses
 * it and git skips every hook), the main checkout's `node_modules` copied on write with its links, and the
 * hygiene baseline `gate --fast` compares with.
 */
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync } from 'node:fs'
import { basename, dirname, isAbsolute, join } from 'node:path'

import { readHooksFolder } from '../git-hooks.ts'
import { mainCheckoutOf, readGit } from '../git.ts'
import { readPackageJson } from '../package-json.ts'
import { WORKTREES_FOLDER } from '../workspace.constants.ts'
import { copyNodeModules } from './copy-node-modules.ts'
import { writeHygieneBaseline } from './hygiene.ts'
import { DEFAULT_BASE_BRANCH } from './worktree.constants.ts'

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
	const nodeModules = join(repository, 'node_modules')
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
