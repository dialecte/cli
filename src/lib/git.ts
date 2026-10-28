/** Read-only git questions the contributor commands ask about the repository they run in. */
import { spawnSync } from 'node:child_process'
import { isAbsolute, join } from 'node:path'

/** Runs git in `root` and answers its standard output; throws with git's message when it fails. */
export function readGit(params: { root: string; args: string[] }): string {
	// paths as they are (`été.ts`), not octal-quoted
	const result = spawnSync('git', ['-c', 'core.quotePath=false', ...params.args], {
		cwd: params.root,
		encoding: 'utf8',
		maxBuffer: 1e8,
	})
	if (result.status !== 0)
		throw new Error(`git ${params.args.join(' ')}: ${(result.stderr || result.stdout).trim()}`)
	return result.stdout
}

/**
 * Files changed against HEAD, staged or not, and new files git does not ignore; deleted files left out
 * unless asked. Relative to the repository root, sorted.
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
	return [...new Set(`${changed}\n${untracked}`.split('\n').filter(Boolean))].sort()
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
