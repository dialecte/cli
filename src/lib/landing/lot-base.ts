/**
 * A lot's base (FIX-ci-loop design, section 1): the ref it lands on and its fork point, from git, never a recorded
 * tip. Cut from the base: the base and the merge-base. Stacked: the parent's landing state decides the ref (the base
 * once the parent merged, else the parent's newest branch tip), and the fork point is the newest commit of the
 * parent's line the lot holds (`git merge-base --fork-point`, reflog-aware, else the plain merge-base), over the
 * parent's local branch and origin's (origin as last fetched: the parent change request's head is the same commit once
 * fetched, so it is not read). The base's merge-base counts too, the parent open or merged: a child already rebased onto
 * the base forks there, and a child that merged the base holds the base's line beside its parent's. When the lot holds
 * lines none of which holds the others, its base is their join: a commit no ref names whose parents are their fork
 * points, so what lies beyond it is the lot's own work alone.
 */
import { firstLineOf, runBoundedGit } from '../coordination/bounded-git.ts'
import { FORECAST_STEP_LIMIT_MS, SNAPSHOT_ENVIRONMENT } from '../coordination/forecast.constants.ts'
import { baseBranchMergeBaseOf } from '../gate/gate-base.ts'
import { isAncestorCommit, readCommitOrNone, tryReadGit } from '../git.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import {
	JOIN_PATH_SEPARATOR,
	LOT_BASE_JOIN_MESSAGE,
	LOT_BASE_REFUSALS,
	PARENT_REF_TEMPLATES,
	REF_LABEL_PREFIXES,
} from './lot-base.constants.ts'

import type { BoundedGitResult } from '../coordination/forecast.types.ts'
import type { LotBase, LotBaseQuery, LotLineFork } from './lot-base.types.ts'

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
	// a lot cut from the base: its merge-base with it, one git spawn
	if (parent === undefined) return baseForkOf({ root, baseRef, head: query.head })
	const baseLabel = labelOf(baseRef)
	// the parent's line first, then the base: a merged parent's base fork point as before, an open parent's merge-base
	// with the base (a child that merged the base holds its line too)
	const forks: LotLineFork[] = [
		...parentRefs.flatMap((ref) =>
			forkPointsOf({ root, ref, head }).map((commit) => ({ commit, label: labelOf(ref) })),
		),
		...(open
			? [baseBranchMergeBaseOf({ root, head, ref: baseRef })].filter(isCommit)
			: forkPointsOf({ root, ref: baseRef, head })
		).map((commit) => ({ commit, label: baseLabel })),
		...landedParentTipOf({ root, head, parent }).map((commit) => ({
			commit,
			label: parent.branch,
		})),
	]
	const [first, ...rest] = independentOf({ root, forks })
	if (first === undefined)
		return refused({
			template: LOT_BASE_REFUSALS.noForkPoint,
			values: { head: query.head, ref: [...parentRefs, baseRef].join(', ') },
		})
	const fork = joinedForkOf({ root, first, rest, baseLabel })
	if ('refusal' in fork) return fork
	if (!open) return { ref: baseRef, label: baseLabel, ...fork }
	return { ref: newestRefOf({ root, refs: parentRefs }), label: parent.branch, ...fork }
}

/**
 * The lines' forks none of the others holds (`git merge-base --independent`), in the order of `forks`, each commit
 * once; none when git cannot tell.
 */
function independentOf(params: { root: string; forks: readonly LotLineFork[] }): LotLineFork[] {
	const { forks } = params
	if (forks.length === 0) return []
	const independent = new Set(
		(
			tryReadGit({
				root: params.root,
				args: ['merge-base', '--independent', ...new Set(forks.map((fork) => fork.commit))],
			}) ?? ''
		)
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean),
	)
	return forks.filter(function keptOnce(fork, index) {
		return (
			independent.has(fork.commit) &&
			forks.findIndex((other) => other.commit === fork.commit) === index
		)
	})
}

/**
 * The lot's fork point from its independent lines: the one line's fork, or the join of them all folded left (each
 * join a commit no ref names whose parents are the two it joins), with the commits joined; refused when two lines do
 * not merge clean or git cannot join them.
 */
function joinedForkOf(params: {
	root: string
	first: LotLineFork
	rest: readonly LotLineFork[]
	baseLabel: string
}): { forkPoint: string; joined?: readonly string[] } | { refusal: string } {
	const { first, rest } = params
	if (rest.length === 0) return { forkPoint: first.commit }
	let joined: LotLineFork | { refusal: string } = first
	for (const line of rest) {
		if ('refusal' in joined) break
		joined = joinOf({ root: params.root, line: joined, other: line, baseLabel: params.baseLabel })
	}
	if ('refusal' in joined) return joined
	return { forkPoint: joined.commit, joined: [first, ...rest].map((line) => line.commit) }
}

/**
 * Lines `line` and `other` joined: `git merge-tree --write-tree` (git picks their merge base), then a commit of that tree on
 * both, with the forecast snapshot's fixed identity and date so the same lines give the same commit; no ref is
 * written. Refused on a conflict (naming the paths and the ways out) or a git that fails.
 */
function joinOf(params: {
	root: string
	line: LotLineFork
	other: LotLineFork
	baseLabel: string
}): LotLineFork | { refusal: string } {
	const { root, line, other } = params
	const merged = runBoundedGit({
		root,
		args: [
			'merge-tree',
			'--write-tree',
			'-z',
			'--name-only',
			'--no-messages',
			line.commit,
			other.commit,
		],
		limitMs: FORECAST_STEP_LIMIT_MS,
	})
	const [tree = '', ...paths] = merged.stdout.split('\0').filter(Boolean)
	if (merged.status === 1)
		return refused({
			template: LOT_BASE_REFUSALS.joinConflict,
			values: {
				a: line.label,
				b: other.label,
				paths: paths.join(JOIN_PATH_SEPARATOR),
				base: params.baseLabel,
			},
		})
	if (merged.status !== 0 || merged.timedOut || tree === '')
		return joinFailed({ ...params, merged })
	const committed = runBoundedGit({
		root,
		args: ['commit-tree', tree, '-p', line.commit, '-p', other.commit, '-m', LOT_BASE_JOIN_MESSAGE],
		limitMs: FORECAST_STEP_LIMIT_MS,
		environment: SNAPSHOT_ENVIRONMENT,
	})
	const commit = committed.stdout.trim()
	if (committed.status !== 0 || commit === '') return joinFailed({ ...params, merged: committed })
	return { commit, label: line.label }
}

/** The refusal of a join git could not make: its first line. */
function joinFailed(params: { line: LotLineFork; other: LotLineFork; merged: BoundedGitResult }): {
	refusal: string
} {
	return refused({
		template: LOT_BASE_REFUSALS.joinFailed,
		values: { a: params.line.label, b: params.other.label, reason: firstLineOf(params.merged) },
	})
}

/** A merge-base read: a commit, not git's answer that there is none. */
function isCommit(commit: string | undefined): commit is string {
	return commit !== undefined
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

/**
 * How a line names a ref: without `refs/remotes/` or `refs/heads/`.
 *
 * @intent name a ref the way the lot's lines print it
 * @internal
 */
export function labelOf(ref: string): string {
	const prefix = REF_LABEL_PREFIXES.find((candidate) => ref.startsWith(candidate))
	return prefix === undefined ? ref : ref.slice(prefix.length)
}
