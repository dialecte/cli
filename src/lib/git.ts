/** Read-only git questions the contributor commands ask about the repository they run in. */
import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'

import { GIT_READ_ENVIRONMENT } from './git.constants.ts'
import { LOT_FILE_PATTERN } from './worktree/worktree.constants.ts'

/** Runs git in `root` and answers its standard output; throws with git's message when it fails. */
export function readGit(params: {
	root: string
	args: string[]
	/** Variables set for this command only, over the cli's environment (`GIT_INDEX_FILE`). */
	environment?: NodeJS.ProcessEnv
	/** What git reads on its standard input (`--stdin`): no limit on the length of an argument list. */
	input?: string
}): string {
	// paths as they are (`été.ts`), not octal-quoted
	const result = spawnSync('git', ['-c', 'core.quotePath=false', ...params.args], {
		cwd: params.root,
		encoding: 'utf8',
		input: params.input,
		maxBuffer: 1e8,
		// a status or diff never refreshes the index behind a commit running at the same time
		env: { ...process.env, ...GIT_READ_ENVIRONMENT, ...params.environment },
	})
	if (result.status !== 0)
		throw new Error(`git ${params.args.join(' ')}: ${(result.stderr || result.stdout).trim()}`)
	return result.stdout
}

/** `readGit`, undefined instead of a throw when git fails (an unknown ref, a missing object). */
export function tryReadGit(params: { root: string; args: string[] }): string | undefined {
	try {
		return readGit(params)
	} catch {
		return undefined
	}
}

/** HEAD's commit as a full sha; undefined in a repository with no commit yet. */
export function readHeadOrNone(root: string): string | undefined {
	return (
		tryReadGit({ root, args: ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}'] })?.trim() ||
		undefined
	)
}

/** `readGit`'s output as git wrote it, bytes never decoded (a path that is no UTF-8 kept byte for byte). */
export function readGitBytes(params: { root: string; args: string[] }): Buffer {
	const result = spawnSync('git', ['-c', 'core.quotePath=false', ...params.args], {
		cwd: params.root,
		maxBuffer: 1e8,
		env: { ...process.env, ...GIT_READ_ENVIRONMENT },
	})
	if (result.status !== 0)
		throw new Error(`git ${params.args.join(' ')}: ${result.stderr.toString().trim()}`)
	return result.stdout
}

/**
 * The bytes of `file` (relative to the repository root) as the index of `root` holds it, never decoded; undefined
 * only when the index holds no entry for it. An unmerged path (a conflict's stages 1-3) throws, as does any other
 * failure (a missing object, not a repository), with git's message.
 */
export function readStagedFile(params: { root: string; file: string }): Buffer | undefined {
	const stages = readGit({
		root: params.root,
		args: ['ls-files', '--stage', '-z', '--', params.file],
	})
		.split('\0')
		.filter(Boolean)
		.filter((entry) => entry.slice(entry.indexOf('\t') + 1) === params.file)
		// `<mode> <object> <stage>\t<path>`
		.map((entry) => entry.slice(0, entry.indexOf('\t')).split(' ')[2])
	if (stages.length === 0) return undefined
	if (stages.some((stage) => stage !== '0'))
		throw new Error(`${params.file} is unmerged in the index (a conflict not resolved)`)
	return readGitBytes({ root: params.root, args: ['show', `:${params.file}`] })
}

/**
 * Files changed against HEAD, staged or not, and new files git does not ignore; deleted files left out
 * unless asked. Relative to the repository root, sorted. The lot declaration (`.dialecte/lot.json`) is
 * never part of a change: the orchestrator writes it for the gate, nobody commits it.
 */
export function listChangedFiles(params: { root: string; withDeleted?: boolean }): string[] {
	const filter = params.withDeleted ? [] : ['--diff-filter=d']
	const changed = readGit({
		root: params.root,
		args: ['diff', '--name-only', '--relative', '--no-renames', ...filter, 'HEAD'],
	})
	const untracked = readGit({
		root: params.root,
		args: ['ls-files', '--others', '--exclude-standard'],
	})
	return [...new Set(`${changed}\n${untracked}`.split('\n').filter(Boolean))]
		.filter((file) => !LOT_FILE_PATTERN.test(file))
		.sort()
}

/** Files under `folder` git tracks or would add (ignored ones left out), relative to `root`, sorted. */
export function listRepositoryFiles(params: { root: string; folder: string }): string[] {
	return readGit({
		root: params.root,
		args: ['ls-files', '--cached', '--others', '--exclude-standard', '--', params.folder],
	})
		.split('\n')
		.filter(Boolean)
		.sort()
}

/** This worktree's own git folder (a linked worktree has one of its own under the main repository). */
export function gitFolderOf(root: string): string {
	const folder = readGit({ root, args: ['rev-parse', '--git-dir'] }).trim()
	return isAbsolute(folder) ? folder : join(root, folder)
}

/** `root` is inside a git work tree: the source reader lists its files through git and keeps a cache. */
export function isInWorkTree(root: string): boolean {
	return tryReadGit({ root, args: ['rev-parse', '--is-inside-work-tree'] })?.trim() === 'true'
}

/** The git folder every worktree of the repository `root` is in shares (absolute). */
export function commonGitFolderOf(root: string): string {
	const common = readGit({
		root,
		args: ['rev-parse', '--path-format=absolute', '--git-common-dir'],
	}).trim()
	return resolve(root, common)
}

/** The name of the branch checked out in `root` (`HEAD` when detached). */
export function currentBranchOf(root: string): string {
	return readGit({ root, args: ['rev-parse', '--abbrev-ref', 'HEAD'] }).trim()
}

/** The branch exists as a ref of the repository `root` (`refs/heads/<branch>`). */
export function branchExists(params: { root: string; branch: string }): boolean {
	try {
		readGit({
			root: params.root,
			args: ['show-ref', '--verify', '--quiet', `refs/heads/${params.branch}`],
		})
		return true
	} catch {
		return false
	}
}

/** The main checkout of the repository `root` belongs to (itself when it is not a linked worktree). */
export function mainCheckoutOf(root: string): string {
	const common = readGit({
		root,
		args: ['rev-parse', '--path-format=absolute', '--git-common-dir'],
	}).trim()
	const main = basename(common) === '.git' ? dirname(common) : common
	// git answers the real path (`/private/var` for `/var` on macOS): keep the caller's spelling of itself
	return realpathSync(main) === realpathSync(root) ? root : main
}

/** `ancestor` is `descendant` or one of its ancestors; a commit git does not hold is not. */
export function isAncestorCommit(params: {
	root: string
	ancestor: string
	descendant: string
}): boolean {
	return (
		spawnSync('git', ['merge-base', '--is-ancestor', params.ancestor, params.descendant], {
			cwd: params.root,
			env: { ...process.env, ...GIT_READ_ENVIRONMENT },
		}).status === 0
	)
}

/** The value of a git config key in `root`, or undefined when it is not set. */
export function readGitConfig(params: { root: string; key: string }): string | undefined {
	const result = spawnSync('git', ['config', '--get', params.key], {
		cwd: params.root,
		encoding: 'utf8',
	})
	return result.status === 0 ? result.stdout.trim() : undefined
}

/** Files staged in the index of `root`, sorted. */
export function listStagedFiles(root: string): string[] {
	return readGit({ root, args: ['diff', '--cached', '--name-only', '--no-renames'] })
		.split('\n')
		.filter(Boolean)
		.sort()
}
