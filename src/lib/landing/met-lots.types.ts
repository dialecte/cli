import type { HostAdapter } from '../host/host.types.ts'

/** A lot a scope met that reads merged: its name, the base it landed on, the tip that landed and what proved it. */
export type LandedMetLot = {
	name: string
	base: string
	tip: string
	how: string
	/** Its landed fact was written (a verb that writes); false for a read only (a dry run, a simulated start). */
	written: boolean
}

/** What settling the met lots found: the lots that landed, and why a merged lot still holds. */
export type MetLotsSettled = {
	landed: readonly LandedMetLot[]
	warnings: readonly string[]
}

/** The host a settle asks only when a met lot is not decided offline (`lazyHostOf`: made on the first call). */
export type LazyHost = () => HostAdapter
