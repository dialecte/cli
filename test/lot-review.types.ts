import type { ChangeRequest } from '../src/lib/host/host.types.ts'
import type { ChangeRequestLot } from './lot-pr.types.ts'

/** A store lot landed as a draft pull request: the lot, its landed head and the pull request as the host holds it. */
export type LandedLot = ChangeRequestLot & { head: string; changeRequest: ChangeRequest }

/** A landed lot no longer at work. */
export type LandedLotState = 'committed' | 'canceled' | 'failed'
