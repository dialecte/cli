/**
 * A lot's base (FIX-ci-loop design, section 1): the ref it lands on and its fork point, from git, never a recorded
 * tip. Cut from the base: the base and the merge-base. Stacked: the parent's landing state decides the ref (the base
 * once the parent merged, else the parent's newest branch tip), and the fork point is the newest commit of the
 * parent's line the lot holds (`git merge-base --fork-point`, reflog-aware, else the plain merge-base), over the
 * parent's local branch and origin's.
 */
import { isAncestorCommit, tryReadGit } from '../git.ts'
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
	const head = commitOf({ root, ref: query.head })
	if (head === undefined)
		return { refusal: LOT_BASE_REFUSALS.noHead.replace('{head}', () => query.head) }
	const lines =
		parent === undefined
			? [baseRef]
			: PARENT_REF_TEMPLATES.map((template) =>
					template.replace('{branch}', () => parent.branch),
				).filter((ref) => commitOf({ root, ref }) !== undefined)
	const forkPoint = newestOf({
		root,
		commits: lines.flatMap((ref) => forkPointsOf({ root, ref, head })),
	})
	if (forkPoint === undefined)
		return {
			refusal: LOT_BASE_REFUSALS.noForkPoint
				.replace('{head}', () => query.head)
				.replace('{ref}', () => lines.join(', ') || (parent?.branch ?? baseRef)),
		}
	if (parent === undefined || parent.landing.kind === 'merged')
		return { ref: baseRef, label: labelOf(baseRef), forkPoint }
	const ref = newestRefOf({ root, refs: lines })
	return { ref, label: parent.branch, forkPoint }
}

/** The commit `ref` names; undefined when it names none. */
function commitOf(params: { root: string; ref: string }): string | undefined {
	const commit = tryReadGit({
		root: params.root,
		args: ['rev-parse', '--verify', '--quiet', `${params.ref}^{commit}`],
	})?.trim()
	return commit || undefined
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
			commitOf({ root, ref: newest }) !== commitOf({ root, ref })
			? ref
			: newest
	})
}

/** How a line names a ref: without `refs/remotes/` or `refs/heads/`. */
function labelOf(ref: string): string {
	const prefix = REF_LABEL_PREFIXES.find((candidate) => ref.startsWith(candidate))
	return prefix === undefined ? ref : ref.slice(prefix.length)
}
