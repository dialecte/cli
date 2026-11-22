/**
 * The commit the change is measured from, with where it came from (`resolveBase` answers the commit alone): one base
 * for `tdd red`, `green`, `status`, the gate and the hook (FIX-ci-loop design, section 4): `--base <ref>` when given,
 * else the lot base (`lotBaseOf`), so a green taken before a rebase still counts after it.
 */
import { findBaseBranchRef, resolveFlagBase } from '../gate/gate-base.ts'
import { readGit, tryReadGit } from '../git.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { lotBaseOf } from '../landing/lot-base.ts'
import { readStackParent } from '../landing/read-stack-parent.ts'
import { lotOfWorktree } from '../store/resolve-lot.ts'
import { readStack } from '../store/stack.ts'
import { TDD_BASE_SOURCES } from './tdd.constants.ts'

import type { PackageJson } from '../package-json.types.ts'
import type { TddBase } from './tdd.types.ts'

/**
 * `ref` (`--base <ref>`): where HEAD left that ref. Else the lot base: HEAD's fork point from the base branch
 * (`findBaseBranchRef`: the newer of the local branch and origin's), or from the parent's line while the stack parent
 * of the worktree's lot is open. HEAD only when no base branch is found and none is configured.
 * Failures: a repository without a commit, an unknown `--base` ref, a set `dialecte.baseBranch` naming no branch, a
 * lot base git cannot read.
 */
export function resolveTddBase(params: {
	root: string
	packageJson: PackageJson
	/** `--base <ref>`: where HEAD left it. */
	ref?: string
}): TddBase | { failure: string } {
	const { root, packageJson } = params
	const head = tryReadGit({ root, args: ['rev-parse', '--verify', '--quiet', 'HEAD'] })?.trim()
	if (!head)
		return {
			failure: `the repository at ${root} has no commit yet: the lot is measured from its base, commit a base first`,
		}
	if (params.ref !== undefined) {
		const flag = resolveFlagBase({ root, ref: params.ref, head: 'HEAD' })
		return 'refusal' in flag
			? { failure: flag.refusal }
			: { commit: flag.commit, kind: 'flag', source: TDD_BASE_SOURCES.flag }
	}
	const found = findBaseBranchRef({ root, packageJson })
	if ('refusal' in found)
		return packageJson.dialecte?.baseBranch === undefined
			? { commit: head, kind: 'head', source: TDD_BASE_SOURCES.head }
			: { failure: found.refusal }
	const lotFolder = lotOfWorktree({ cwd: root })
	const parent = lotFolder === undefined ? undefined : readStackParent({ lotFolder, root })
	if (parent !== undefined && 'refusal' in parent) return { failure: `tdd base: ${parent.refusal}` }
	const base = lotBaseOf({
		root,
		head: 'HEAD',
		baseRef: found.ref,
		...(parent !== undefined && { parent }),
	})
	if ('refusal' in base) return { failure: `tdd base: ${base.refusal}` }
	return {
		commit: base.forkPoint,
		kind: 'lot',
		source: fillMessage({ template: TDD_BASE_SOURCES.lotBase, values: { ref: base.label } }),
	}
}

/**
 * Whether the worktree at `root` holds a store lot started on another (`stack.json`, a damaged one included): its base
 * is then its parent's fork point, not the base branch's merge-base, and a damaged record refuses there. Files only, no
 * git.
 *
 * @intent tell when a lot's base differs from the base branch's merge-base
 * @internal
 */
export function isStackedLotWorktree(params: { root: string }): boolean {
	const lotFolder = lotOfWorktree({ cwd: params.root })
	return lotFolder !== undefined && readStack({ lotFolder }) !== undefined
}

/** The short id of `commit`, as git abbreviates it in the repository at `root`. */
export function shortCommitOf(params: { root: string; commit: string }): string {
	return readGit({ root: params.root, args: ['rev-parse', '--short', params.commit] }).trim()
}
