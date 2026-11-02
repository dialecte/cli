import type { MutationTier } from '../src/lib/mutation/mutation.types.ts'

/** What a fake Stryker call saw of its incremental file, read while the call ran. */
export type IncrementalCall = {
	tier: MutationTier
	/** The option as given (package-relative). */
	incrementalFile: string | undefined
	/** Whether the file existed when Stryker was called, and what it held. */
	existed: boolean
	content: string | undefined
	/** What the legacy shared file `.tmp/mutants/incremental.json` held when called. */
	legacyContent: string | undefined
}

/** How a tier's call fails, after it wrote its incremental file. */
export type TierFailure = 'throws' | 'exit' | 'no-report'
