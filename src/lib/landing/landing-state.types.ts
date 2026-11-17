import type { HostAdapter, PullRequest } from '../host/host.types.ts'
import type { LANDING_EVIDENCES } from './landing-state.constants.ts'

/** What proved a lot merged: its tip on the base, the host's merged pull request, or its work contained in the base. */
export type LandingEvidence = (typeof LANDING_EVIDENCES)[number]

/**
 * What a lot's branch is to the base it lands on (FIX-ci-loop design, section 1): nothing of its own (`empty`), work
 * the base does not hold (`unlanded`, with its open pull request when the host was asked), in the base (`merged`, with
 * what proved it and the tip that landed), refused by the host (`closed`: its pull request closed unmerged, its work
 * not in the base), or not readable (`unknown`).
 */
export type LandingState =
	| { kind: 'empty' }
	| { kind: 'unlanded'; pull?: PullRequest; hostRefusal?: string }
	| { kind: 'merged'; how: LandingEvidence; tip: string; pull?: PullRequest }
	| { kind: 'closed'; pull: PullRequest }
	| { kind: 'unknown'; reason: string }

/** What the landing state of a lot is read from. */
export type LandingQuery = {
	/** The repository (any of its worktrees: refs are shared). */
	root: string
	/** The lot's branch, its short name. */
	branch: string
	/** The ref the lot lands on, as fetched: `refs/remotes/origin/<base>`. */
	baseRef: string
	/** The commit the lot was cut from (its identity's base commit): a tip there holds nothing of its own. */
	cut: string
	/** The pull request the lot's landing recorded; the host is asked by the branch when left out. */
	pullNumber?: number
	/** Asked for the pull request when given; git alone decides without it. */
	host?: HostAdapter
}
