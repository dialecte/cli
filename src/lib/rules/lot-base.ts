import { isInWorkTree, tryReadGit } from '../git.ts'
import { readIdentity } from '../store/identity.ts'
import { lotOfWorktree } from '../store/resolve-lot.ts'
import { readHygieneBaseline } from '../worktree/hygiene.ts'
import { LOT_BASE_LINE } from './lot-base.constants.ts'

import type { LotBase } from './lot-base.types.ts'

/**
 * The base of the lot the worktree at `root` belongs to (its lot link's identity base, else the hygiene baseline's
 * `from`) as a merge-base with HEAD; undefined when neither names a ref git can read, or outside a git work tree.
 */
export function readLotBase(params: { root: string }): LotBase | undefined {
	const { root } = params
	if (!isInWorkTree(root)) return undefined
	const lotFolder = lotOfWorktree({ cwd: root })
	const identity = lotFolder === undefined ? undefined : readIdentity({ lotFolder })
	if (identity !== undefined) {
		const ref = identity.base.ref || identity.base.commit
		return lotBaseOf({ root, ref, line: LOT_BASE_LINE.lot.replace('{name}', identity.name) })
	}
	const from = readHygieneBaseline(root)?.from
	if (!from) return undefined
	return lotBaseOf({ root, ref: from, line: LOT_BASE_LINE.worktree.replace('{ref}', from) })
}

/** The merge-base of HEAD and `ref` with `line` naming its short sha; undefined when git cannot read the ref. */
function lotBaseOf(params: { root: string; ref: string; line: string }): LotBase | undefined {
	const { root, ref } = params
	if (!ref) return undefined
	const base = tryReadGit({ root, args: ['merge-base', 'HEAD', ref] })?.trim()
	if (!base) return undefined
	const shortSha = tryReadGit({ root, args: ['rev-parse', '--short', base] })?.trim()
	if (!shortSha) return undefined
	return { base, line: params.line.replace('{sha}', shortSha) }
}
