import type { StepLot } from './step-events-lot.types.ts'

/** A step lot whose worktree is on the branch of a second lot of the store. */
export type MutationLot = StepLot & {
	/** Where the second lot (the one the branch names) would record: it must stay empty. */
	namedByBranchEventsFile: string
}
