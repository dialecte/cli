/**
 * The state hash of a worktree: sha256 of the tree it would commit - HEAD's tree with the changed and
 * untracked files on top as `git add -A` stages them (deletions removed), `.dialecte/` left out. The tree is
 * built in an index of its own (no commit object made): the repository's index is never touched.
 */
import { createHash } from 'node:crypto'

import { readGit } from '../git.ts'
import { addWorkingFilesToTree } from '../handover/trial-base.ts'
import { workTreeTopOf } from '../review-rounds/worktree-state.ts'
import { STATE_EXCLUDED_PATTERN } from './gate-records.constants.ts'

/** The state hash of the worktree `root` is in (any folder of it). */
export function computeStateHash(root: string): string {
	const top = workTreeTopOf(root) ?? root
	const files = listWorkingChanges(top).filter((file) => !STATE_EXCLUDED_PATTERN.test(file))
	const headTree = readGit({ root: top, args: ['rev-parse', 'HEAD^{tree}'] }).trim()
	const tree = addWorkingFilesToTree({ root: top, tree: headTree, files })
	return createHash('sha256').update(tree).digest('hex')
}

/**
 * The paths at `top` that differ from HEAD (deleted ones included) and the untracked ones git does not
 * ignore, relative to `top`; a nested repository (listed as a folder) left out. No optional lock taken.
 */
function listWorkingChanges(top: string): string[] {
	const changed = readGit({
		root: top,
		args: ['--no-optional-locks', 'diff', '--name-only', '-z', '--no-renames', 'HEAD'],
	})
	const untracked = readGit({
		root: top,
		args: ['--no-optional-locks', 'ls-files', '-z', '--others', '--exclude-standard'],
	})
	const paths = new Set(
		[...changed.split('\0'), ...untracked.split('\0')].filter(
			(path) => path && !path.endsWith('/'),
		),
	)
	return [...paths]
}
