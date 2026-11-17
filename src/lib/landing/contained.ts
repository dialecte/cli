/** Whether a commit's work is in a base: the one predicate for "landed" that survives a squash and a rebase. */
import { tryReadGit } from '../git.ts'

/**
 * True when merging `commit` into `baseRef` changes nothing: `git merge-tree --write-tree` gives the base's own tree.
 * A conflict, a missing commit or unrelated histories are false: work the base may not hold is never read as landed.
 * A git without `merge-tree --write-tree` (before 2.38) reads every commit as not contained: conservative, a squash
 * then reads unlanded (the forecast refuses such a git by name). A lot whose changes cancel out (a change and its
 * revert) is contained: it has nothing left to land.
 *
 * @intent tell a commit whose work the base already holds, whatever its history
 * @internal
 */
export function isContainedIn(params: { root: string; baseRef: string; commit: string }): boolean {
	const { root, baseRef } = params
	const baseTree = tryReadGit({
		root,
		args: ['rev-parse', '--verify', '--quiet', `${baseRef}^{tree}`],
	})?.trim()
	if (!baseTree) return false
	const merged = tryReadGit({
		root,
		args: ['merge-tree', '--write-tree', '--no-messages', baseRef, params.commit],
	})
	return merged?.split('\n')[0]?.trim() === baseTree
}
