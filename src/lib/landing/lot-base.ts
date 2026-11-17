/**
 * A lot's base (FIX-ci-loop design, section 1): the ref it lands on and its fork point, from git, never a recorded
 * tip. Cut from the base: the base and the merge-base. Stacked: the parent's landing state decides the ref (the base
 * once the parent merged, else the parent's newest branch tip), and the fork point is the newest commit of the
 * parent's line the lot holds (`git merge-base --fork-point`, reflog-aware, else the plain merge-base), over the
 * parent's local branch and origin's (origin as last fetched: the parent pull request's head is the same commit once
 * fetched, so it is not read). Once the parent merged, the base's own fork point counts too: a child already rebased
 * onto the base forks there.
 */
import { isAncestorCommit, readCommitOrNone, tryReadGit } from '../git.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import {
	LOT_BASE_REFUSALS,
	PARENT_REF_TEMPLATES,
	REF_LABEL_PREFIXES,
} from './lot-base.constants.ts'

import type { LotBase, LotBaseQuery } from './lot-base.types.ts'

/**
 * The base of the lot `query` names, or why it cannot be read.
 *
 * @intent read where a lot lands and what of it is its own, from git
 * @internal
 */
export function lotBaseOf(query: LotBaseQuery): LotBase | { refusal: string } {
	const { root, baseRef, parent } = query
	const head = readCommitOrNone({ root, ref: query.head })
	if (head === undefined)
		return refused({ template: LOT_BASE_REFUSALS.noHead, values: { head: query.head } })
	const parentRefs =
		parent === undefined
			? []
			: PARENT_REF_TEMPLATES.map((template) =>
					fillMessage({ template, values: { branch: parent.branch } }),
				).filter((ref) => readCommitOrNone({ root, ref }) !== undefined)
	const open = parent !== undefined && parent.landing.kind !== 'merged'
	if (open && parentRefs.length === 0)
		return refused({ template: LOT_BASE_REFUSALS.noParentRef, values: { branch: parent.branch } })
	// a merged parent's line and the base both count: a child already rebased onto the base forks there
	// a lot cut from the base: its merge-base with it, one git spawn
	if (parent === undefined) return baseForkOf({ root, baseRef, head: query.head })
	const lines = open ? parentRefs : [...parentRefs, baseRef]
	const forkPoint = newestOf({
		root,
		commits: [
			...lines.flatMap((ref) => forkPointsOf({ root, ref, head })),
			...landedParentTipOf({ root, head, parent }),
		],
	})
	if (forkPoint === undefined)
		return refused({
			template: LOT_BASE_REFUSALS.noForkPoint,
			values: { head: query.head, ref: lines.join(', ') },
		})
	if (!open) return { ref: baseRef, label: labelOf(baseRef), forkPoint }
	return { ref: newestRefOf({ root, refs: parentRefs }), label: parent.branch, forkPoint }
}

/**
 * The merged parent's landed tip when the lot holds it: the one fork point left once the parent's branches are gone
 * (deleted here and on origin after a squash), else the base's merge-base would be the cut and replay the parent.
 */
function landedParentTipOf(params: {
	root: string
	head: string
	parent: LotBaseQuery['parent']
}): string[] {
	const landing = params.parent?.landing
	if (landing?.kind !== 'merged') return []
	return isAncestorCommit({ root: params.root, ancestor: landing.tip, descendant: params.head })
		? [landing.tip]
		: []
}

/** The base of a lot cut from the base: its plain merge-base with it, or the refusal when they share none. */
function baseForkOf(params: {
	root: string
	baseRef: string
	head: string
}): LotBase | { refusal: string } {
	const forkPoint = tryReadGit({
		root: params.root,
		args: ['merge-base', params.head, params.baseRef],
	})?.trim()
	if (!forkPoint)
		return refused({
			template: LOT_BASE_REFUSALS.noForkPoint,
			values: { head: params.head, ref: params.baseRef },
		})
	return { ref: params.baseRef, label: labelOf(params.baseRef), forkPoint }
}

/** A refusal of `lotBaseOf`, its template filled. */
function refused(params: { template: string; values: Record<string, string> }): {
	refusal: string
} {
	return { refusal: fillMessage(params) }
}

/** The commits of `ref`'s line that `head` holds: git's reflog-aware fork point, and the plain merge-base. */
function forkPointsOf(params: { root: string; ref: string; head: string }): string[] {
	const { root, ref, head } = params
	return [
		tryReadGit({ root, args: ['merge-base', '--fork-point', ref, head] }),
		tryReadGit({ root, args: ['merge-base', ref, head] }),
	]
		.map((commit) => commit?.trim() ?? '')
		.filter((commit) => commit !== '')
}

/** The newest of `commits`: the one every other is an ancestor of, kept first when two diverge. */
function newestOf(params: { root: string; commits: readonly string[] }): string | undefined {
	const { root } = params
	return params.commits.reduce<string | undefined>(function newer(newest, commit) {
		if (newest === undefined) return commit
		return isAncestorCommit({ root, ancestor: newest, descendant: commit }) ? commit : newest
	}, undefined)
}

/** The newest tip of `refs` (the first, the local branch, when they diverge). */
function newestRefOf(params: { root: string; refs: readonly string[] }): string {
	const { root } = params
	return params.refs.reduce(function newer(newest, ref) {
		return isAncestorCommit({ root, ancestor: newest, descendant: ref }) &&
			readCommitOrNone({ root, ref: newest }) !== readCommitOrNone({ root, ref })
			? ref
			: newest
	})
}

/** How a line names a ref: without `refs/remotes/` or `refs/heads/`. */
function labelOf(ref: string): string {
	const prefix = REF_LABEL_PREFIXES.find((candidate) => ref.startsWith(candidate))
	return prefix === undefined ? ref : ref.slice(prefix.length)
}
