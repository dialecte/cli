import type { KeepJson, KeepOp } from '../lib/store/keep-decisions.types.ts'
import type { CheckedLotState } from '../lib/store/store.types.ts'

/** A `lot keep` or `lot unkeep` request its words make: the verb's op, the id, who and why, and the JSON flag. */
export type KeepRequest = { op: KeepOp; id: string; by: string; reason: string; json: boolean }

/**
 * The lot a keep verb writes to: its folder, its name, its root for the text checks, whether it is simulated, and the
 * one read of its records (its keep, its state) every decision of the verb takes.
 */
export type KeepTarget = {
	lotFolder: string
	name: string
	root: string
	simulated: boolean
	checked: CheckedLotState
}

/** What `lot keep --json` and `lot unkeep --json` print. */
export type KeepVerbJson = { lot: string; kept: KeepJson; written: boolean; next: string | null }
