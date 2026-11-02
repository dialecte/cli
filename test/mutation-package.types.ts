import type { MutationTier, StrykerOptions } from '../src/lib/mutation/mutation.types.ts'

/** One call of the fake Stryker: the tier it was for, its options, and the states of the store's runs when it was called. */
export type StrykerCall = {
	tier: MutationTier
	options: StrykerOptions
	runStatesAtCall: string[]
}

export type MutantSpec = {
	id: string
	status: string
	replacement?: string
}
