/** The tree git itself builds for a worktree's files, to compare a computed key with. */
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'

import { git, temporaryFolder } from './scratch-repository.ts'

/**
 * The tree of HEAD with every changed and untracked file on top (`git add -A`, `.dialecte/` left out, deletions
 * removed), built in an index of its own: the repository's index is never touched.
 */
export function treeOfWorkingFiles(root: string): string {
	const indexFile = join(temporaryFolder('dialecte-test-index-'), 'index')
	function run(args: string[]): string {
		const result = spawnSync('git', args, {
			cwd: root,
			encoding: 'utf8',
			env: { ...process.env, GIT_INDEX_FILE: indexFile },
		})
		if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`)
		return result.stdout
	}
	run(['read-tree', 'HEAD'])
	run(['add', '-A', '--', '.', ':(exclude).dialecte'])
	return run(['write-tree']).trim()
}

/** The git folder every worktree of the repository shares (absolute). */
export function commonGitDirOf(root: string): string {
	return resolve(
		root,
		git({ root, args: ['rev-parse', '--path-format=absolute', '--git-common-dir'] }).trim(),
	)
}

/** A second worktree of the repository at its HEAD, in a folder of the test's own. */
export function addWorktree(root: string): string {
	const second = join(temporaryFolder('dialecte-second-worktree-'), 'second')
	git({ root, args: ['worktree', 'add', '-q', second, '-b', 'second'] })
	return second
}
