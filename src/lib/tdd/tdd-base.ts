/**
 * The commit the change is measured from, with where it came from (`resolveBase` answers the commit alone): one base
 * for `tdd red`, `green`, `status`, the gate and the hook (FIX-ci-loop design, section 4): `--base <ref>` when given,
 * else the lot base (`lotBaseOf`), so a green taken before a rebase still counts after it.
 */
import { dirname, join } from 'node:path'

import { findBaseBranchRef } from '../gate/gate-base.ts'
import { readGit, tryReadGit } from '../git.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { readLandingState } from '../landing/landing-state.ts'
import { lotBaseOf } from '../landing/lot-base.ts'
import { readIdentity } from '../store/identity.ts'
import { lotOfWorktree } from '../store/resolve-lot.ts'
import { readStackRecord } from '../store/stack.ts'
import { TDD_BASE_SOURCES } from './tdd.constants.ts'

import type { StackParent } from '../landing/lot-base.types.ts'
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
	if (params.ref !== undefined) return resolveFlagBase({ root, ref: params.ref })
	const found = findBaseBranchRef({ root, packageJson })
	if ('refusal' in found)
		return packageJson.dialecte?.baseBranch === undefined
			? { commit: head, source: TDD_BASE_SOURCES.head }
			: { failure: found.refusal }
	const parent = stackParentOf({ root, baseRef: found.ref })
	const base = lotBaseOf({
		root,
		head: 'HEAD',
		baseRef: found.ref,
		...(parent !== undefined && { parent }),
	})
	if ('refusal' in base) return { failure: `tdd base: ${base.refusal}` }
	return {
		commit: base.forkPoint,
		source: fillMessage({ template: TDD_BASE_SOURCES.lotBase, values: { ref: base.label } }),
	}
}

/**
 * Whether the worktree at `root` holds a store lot started on another (`stack.json`): its base is then its parent's
 * fork point, not the base branch's merge-base. Files only, no git.
 *
 * @intent tell when a lot's base differs from the base branch's merge-base
 * @internal
 */
export function isStackedLotWorktree(params: { root: string }): boolean {
	const lotFolder = lotOfWorktree({ cwd: params.root })
	return lotFolder !== undefined && readStackRecord({ lotFolder }) !== undefined
}

/**
 * The open lot the worktree's lot was started on (`stack.json`), its branch and its landing state (git only); undefined
 * for a worktree of no store lot, a lot not stacked, or a parent whose identity cannot be read.
 */
function stackParentOf(params: { root: string; baseRef: string }): StackParent | undefined {
	const { root } = params
	const lotFolder = lotOfWorktree({ cwd: root })
	if (lotFolder === undefined) return undefined
	const stack = readStackRecord({ lotFolder })
	if (stack === undefined) return undefined
	const identity = readIdentity({ lotFolder: join(dirname(lotFolder), stack.parent) })
	if (identity === undefined) return undefined
	return {
		branch: identity.branch,
		landing: readLandingState({
			root,
			branch: identity.branch,
			baseRef: params.baseRef,
			cut: identity.base.commit,
		}),
	}
}

/** `--base <ref>`: the merge-base of HEAD and the ref, else the commit it names. */
function resolveFlagBase(params: { root: string; ref: string }): TddBase | { failure: string } {
	const { root, ref } = params
	const base =
		tryReadGit({ root, args: ['merge-base', 'HEAD', ref] }) ??
		tryReadGit({ root, args: ['rev-parse', '--verify', '--quiet', ref] })
	return base
		? { commit: base.trim(), source: TDD_BASE_SOURCES.flag }
		: { failure: `--base ${ref}: no such commit` }
}

/** The short id of `commit`, as git abbreviates it in the repository at `root`. */
export function shortCommitOf(params: { root: string; commit: string }): string {
	return readGit({ root: params.root, args: ['rev-parse', '--short', params.commit] }).trim()
}
