/**
 * The landing state of a lot (FIX-ci-loop design, section 1): the one reader every verb asks whether a lot landed.
 * Evidence in order, the first that decides wins: nothing beyond its cut (`empty`); its tip on the base (`ancestor`);
 * the host's merged pull request of the lot (`host`, asked only when a host is given); its work contained in the base
 * (`tree`, a squash read offline). Else unlanded, or closed when the host closed its pull request unmerged. A host
 * that refuses leaves the decision to git, its reason kept on an unlanded state.
 */
import { ORIGIN_BRANCH_REF_PREFIX } from '../gate/gate-base.constants.ts'
import { isAncestorCommit, readCommitOrNone, tryReadGit } from '../git.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { isContainedIn } from './contained.ts'
import {
	LANDING_UNKNOWN,
	REFLOG_ENTRY_FORMAT,
	REFLOG_ENTRY_PATTERN,
} from './landing-state.constants.ts'

import type { PullRequest } from '../host/host.types.ts'
import type { LandingQuery, LandingState } from './landing-state.types.ts'

/**
 * The landing state of the lot `query` names.
 *
 * @intent tell whether a lot landed, by merge, squash or the host, with one reader
 * @internal
 */
export function readLandingState(query: LandingQuery): LandingState {
	const { root, branch, baseRef, cut } = query
	const tip = readCommitOrNone({ root, ref: `refs/heads/${branch}` })
	if (tip === undefined)
		return {
			kind: 'unknown',
			reason: fillMessage({ template: LANDING_UNKNOWN.noBranch, values: { branch } }),
		}
	if (readCommitOrNone({ root, ref: baseRef }) === undefined)
		return {
			kind: 'unknown',
			reason: fillMessage({ template: LANDING_UNKNOWN.noBase, values: { ref: baseRef } }),
		}
	if (isAncestorCommit({ root, ancestor: tip, descendant: cut })) return { kind: 'empty' }
	if (isAncestorCommit({ root, ancestor: tip, descendant: baseRef }))
		return { kind: 'merged', how: 'ancestor', tip }
	const asked = readLotPull({ query, tip })
	if (asked.pull?.state === 'merged')
		return { kind: 'merged', how: 'host', tip: asked.pull.head, pull: asked.pull }
	if (isContainedIn({ root, baseRef, commit: tip })) return { kind: 'merged', how: 'tree', tip }
	if (asked.pull?.state === 'closed') return { kind: 'closed', pull: asked.pull }
	return {
		kind: 'unlanded',
		...(asked.pull && { pull: asked.pull }),
		...(asked.refusal !== undefined && { hostRefusal: asked.refusal }),
		...(isUnprovenOffline({ query, answered: asked.pull !== undefined }) && {
			proof: 'offline-unproven' as const,
		}),
	}
}

/**
 * The lot may have landed though git alone cannot prove it: no host answered, and it has a recorded pull request or a
 * branch on origin (a squash main later edited the same lines of reads unlanded to git).
 */
function isUnprovenOffline(params: { query: LandingQuery; answered: boolean }): boolean {
	const { query } = params
	if (params.answered) return false
	if (query.pullNumber !== undefined) return true
	return (
		readCommitOrNone({ root: query.root, ref: `${ORIGIN_BRANCH_REF_PREFIX}${query.branch}` }) !==
		undefined
	)
}

/**
 * The lot's pull request as the host holds it, when a host is given: the one its landing recorded, else the branch's
 * newest, which is the lot's only when its head is a commit of the lot (beyond its cut, held by its tip or once its
 * branch's tip); the host's refusal when it cannot say.
 */
function readLotPull(params: { query: LandingQuery; tip: string }): {
	pull?: PullRequest
	refusal?: string
} {
	const { query } = params
	if (query.host === undefined) return {}
	const byNumber = query.pullNumber !== undefined
	const read = query.host.readPullRequest({
		root: query.root,
		ref: byNumber ? String(query.pullNumber) : query.branch,
	})
	if (read === undefined) return {}
	if ('refusal' in read) return { refusal: read.refusal }
	if (byNumber || isLotCommit({ query, tip: params.tip, commit: read.head })) return { pull: read }
	return {}
}

/**
 * `commit` is the lot's own: beyond its cut, and held by its tip or reached by its branch (its reflog) since the lot was
 * created (`since`): a branch name reused by a new lot never takes what the name reached before.
 */
function isLotCommit(params: { query: LandingQuery; tip: string; commit: string }): boolean {
	const { query, commit } = params
	const { root } = query
	if (commit === '' || isAncestorCommit({ root, ancestor: commit, descendant: query.cut }))
		return false
	if (isAncestorCommit({ root, ancestor: commit, descendant: params.tip })) return true
	return reflogSince({ root, branch: query.branch, since: query.since }).includes(commit)
}

/** The commits the branch's reflog names, only its entries written at or after `since` when given (ISO 8601). */
function reflogSince(params: {
	root: string
	branch: string
	since: string | undefined
}): string[] {
	const reached = tryReadGit({
		root: params.root,
		args: [
			'reflog',
			'show',
			'--date=unix',
			REFLOG_ENTRY_FORMAT,
			`refs/heads/${params.branch}`,
			'--',
		],
	})
	const from = params.since === undefined ? undefined : Date.parse(params.since) / 1000
	return (reached ?? '').split('\n').flatMap(function entryCommit(line): string[] {
		const match = REFLOG_ENTRY_PATTERN.exec(line)
		if (match === null) return []
		const [, commit = '', seconds = ''] = match
		return from === undefined || Number.isNaN(from) || Number(seconds) >= from ? [commit] : []
	})
}
