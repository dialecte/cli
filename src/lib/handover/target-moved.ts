/**
 * Whether the target branch moved past a hand-over: its tip held by the lots file's `head` or by the tip of one of its
 * merge lots, or not (the lot that lands second must merge the target first).
 */
import { findBaseBranchRef, findBranchRef } from '../gate/gate-base.ts'
import { isAncestorCommit, readGit, tryReadGit } from '../git.ts'
import {
	TARGET_BRANCH_NOT_FOUND,
	TARGET_MOVED_LINE,
	TARGET_RESUME_SUFFIX,
	TARGET_TIP_LENGTH,
} from './handover.constants.ts'
import { isMergeLotPlan } from './read-lots-file.ts'

import type { PackageJson } from '../package-json.types.ts'
import type { Refusal } from '../refusal.types.ts'
import type { LotsFile, TargetVerdict } from './handover.types.ts'

/**
 * Where the target branch stands against the hand-over of `lotsFile`, read now: `skip` for a DONE or ABANDONED
 * hand-over, every lot committed already (`committed`, the caller's count), or lots that go on the target branch itself; `missing` when the target
 * (`lotsFile.target`, else the resolved base branch) has no ref; `held` when its tip is an ancestor of (or equal to)
 * the lots file's `head` or of a merge lot's tip; else `moved`, with the commits of the target the hand-over lacks.
 */
export function targetMoved(params: {
	root: string
	lotsFile: LotsFile
	packageJson: PackageJson
	/** How many lots the caller found committed on top of the head (the card's commits, the run's head guard). */
	committed: number
	/** The hand-over is DONE: nothing to judge. */
	done?: boolean
	/** The hand-over is ABANDONED: nothing to judge. */
	abandoned?: boolean
}): TargetVerdict {
	const { root, lotsFile, committed } = params
	if (params.done || params.abandoned) return { kind: 'skip' }
	const head = tryReadGit({
		root,
		args: ['rev-parse', '--verify', '--quiet', `${lotsFile.head}^{commit}`],
	})?.trim()
	// a head the repository does not hold: the head guard refuses it
	if (head === undefined) return { kind: 'skip' }
	if (committed === lotsFile.lots.length) return { kind: 'skip' }
	const target = findTargetRef({ root, lotsFile, packageJson: params.packageJson })
	if ('refusal' in target) return { kind: 'missing', refusal: target.refusal }
	if (target.branch === lotsFile.branch) return { kind: 'skip' }
	const tip = readGit({ root, args: ['rev-parse', `${target.ref}^{commit}`] }).trim()
	const holders = [
		head,
		...lotsFile.lots.filter(isMergeLotPlan).map(function mergedTip(lot) {
			return lot.tip
		}),
	]
	const held = holders.some(function holdsTip(holder) {
		return isAncestorCommit({ root, ancestor: tip, descendant: holder })
	})
	if (held) return { kind: 'held', branch: target.branch, ref: target.ref }
	// a merge lot's tip the repository does not hold counts for nothing: the commits not in the head
	const counted =
		tryReadGit({ root, args: ['rev-list', '--count', tip, '--not', ...holders] }) ??
		readGit({ root, args: ['rev-list', '--count', tip, '--not', head] })
	const behind = Number(counted.trim())
	return {
		kind: 'moved',
		branch: target.branch,
		ref: target.ref,
		tip,
		behind,
		resuming: committed > 0,
	}
}

/**
 * The text the card's `!` line and the `target` guard print for a verdict that refuses: the moved line (the resume
 * advice added while some lots are committed), or the refusal of a missing target; undefined for the others.
 */
export function targetLineOf(verdict: TargetVerdict): string | undefined {
	if (verdict.kind === 'missing') return verdict.refusal
	if (verdict.kind !== 'moved') return undefined
	// a branch name taken as it is (a `$` in it is no replacement pattern)
	const line = TARGET_MOVED_LINE.replaceAll('{branch}', () => verdict.branch)
		.replace('{count}', String(verdict.behind))
		.replace('{tip}', verdict.tip.slice(0, TARGET_TIP_LENGTH))
	return verdict.resuming
		? `${line}${TARGET_RESUME_SUFFIX.replaceAll('{branch}', () => verdict.branch)}`
		: line
}

/**
 * The branch the lots of `lotsFile` land on and its ref: `lotsFile.target` (the local branch, else origin's; neither
 * is a refusal naming it, never a fall-back), else the resolved base branch (`findBaseBranchRef`).
 */
export function findTargetRef(params: {
	root: string
	lotsFile: Pick<LotsFile, 'target'>
	packageJson: PackageJson
}): { branch: string; ref: string } | Refusal {
	const { root } = params
	const { target } = params.lotsFile
	if (target === undefined) {
		const found = findBaseBranchRef({ root, packageJson: params.packageJson })
		return 'refusal' in found ? found : { branch: found.branch, ref: found.ref }
	}
	const ref = findBranchRef({ root, branch: target })
	return ref === undefined
		? { refusal: TARGET_BRANCH_NOT_FOUND.replace('{branch}', () => target) }
		: { branch: target, ref }
}
