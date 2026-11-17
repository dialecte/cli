import type { PullRequest } from '../src/lib/host/host.types.ts'
import type { PullRequestLot } from './lot-pr.types.ts'

/** A store lot landed as a draft pull request: the lot, its landed head and the pull request as the host holds it. */
export type LandedLot = PullRequestLot & { head: string; pullRequest: PullRequest }

/** A landed lot no longer at work. */
export type LandedLotState = 'committed' | 'canceled' | 'failed'
