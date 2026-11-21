/**
 * The work tree a lot verb reads (SAFE 3.6): a store lot's own worktree from anywhere, else the cwd's work tree for a
 * folder with no identity (a plain hand-over folder).
 */
import { basename } from 'node:path'

import { isFolder } from '../file-system.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { LOT_TREE_REFUSALS } from '../review-rounds/review-rounds.constants.ts'
import { workTreeTopOf } from '../review-rounds/worktree-state.ts'
import { readIdentity } from './identity.ts'

/**
 * The top of the work tree `lot verify`, `lot snapshot` and `lot delta` read for `folder`: a store lot's
 * `identity.worktree` (refused, naming the lot, when it is null or no folder); for a folder with no identity, the work
 * tree holding `cwd`, undefined when none does.
 *
 * @intent read a lot's own tree from wherever its verb runs
 * @internal
 */
export function lotTreeOf(params: {
	folder: string
	cwd: string
}): { root: string } | { refusal: string } | undefined {
	const identity = readIdentity({ lotFolder: params.folder })
	if (identity === undefined) {
		const root = workTreeTopOf(params.cwd)
		return root === undefined ? undefined : { root }
	}
	const lot = basename(params.folder)
	const { worktree } = identity
	if (worktree === null)
		return { refusal: fillMessage({ template: LOT_TREE_REFUSALS.none, values: { lot } }) }
	const root = isFolder(worktree) ? workTreeTopOf(worktree) : undefined
	if (root === undefined)
		return { refusal: fillMessage({ template: LOT_TREE_REFUSALS.gone, values: { lot, worktree } }) }
	return { root }
}
