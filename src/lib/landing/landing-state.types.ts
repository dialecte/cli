import type { HostAdapter, PullRequest } from '../host/host.types.ts'
import type { LANDING_EVIDENCES, LANDING_PROOFS } from './landing-state.constants.ts'

/** Why an unlanded reading cannot be trusted offline: the lot may have landed, only the host can say. */
export type LandingProof = (typeof LANDING_PROOFS)[number]

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
	| {
			kind: 'unlanded'
			pull?: PullRequest
			hostRefusal?: string
			/**
			 * `offline-unproven`: git alone found the work not in the base, yet the lot was pushed (its branch on origin)
			 * or has a recorded pull request, and no host answered: a squash merge main later edited reads so. Only the
			 * host can tell (`lot close`).
			 */
			proof?: LandingProof
	  }
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
	/**
	 * When the lot was created (its identity's `created`, ISO 8601): a pull request found by branch is the lot's only
	 * when its branch reached the head from then on (a branch name reused by a new lot never takes an older lot's).
	 */
	since?: string
	/** The pull request the lot's landing recorded; the host is asked by the branch when left out. */
	pullNumber?: number
	/** Asked for the pull request when given; git alone decides without it. */
	host?: HostAdapter
}
