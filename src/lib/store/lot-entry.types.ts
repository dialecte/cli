import type { StoreEntry } from '../handover/handover.types.ts'
import type { LotIdentity, CheckedLotState } from './store.types.ts'

/**
 * Why a lot whose hand-over was committed outside its folder reads `committed`: the entry the reading picked (the
 * latest written), the folder that entry registers, and the branch the lot's branch is on.
 */
export type LandedReading = { entry: StoreEntry; folder: string; target: string }

/**
 * The git probe of the landed reading: the lot's branch is past its base commit and on the target branch. Undefined
 * when it is not.
 */
export type LandedProbe = (params: {
	identity: LotIdentity
	entry: StoreEntry
}) => LandedReading | undefined

/** A lot read and its records validated, with the landed reading when its hand-over was committed elsewhere. */
export type LandedLotState = CheckedLotState & { landed?: LandedReading }

/** The branch a landed lot's branch must be on: its full ref and its name. */
export type LandedTarget = { ref: string; branch: string }

/** The probe's target branch once resolved (at its first call, or by its caller): undefined when none was found. */
export type LandedTargetResolution = {
	resolved: boolean
	target?: LandedTarget
}
