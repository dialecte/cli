import type { StepLot } from './step-events-lot.types.ts'

/** The two lots: the one whose worktree the command runs in, and the one the command names. */
export type DeltaScene = {
	/** The lot found from the folder the command runs in (its worktree is real). */
	inLot: StepLot
	/** The lot `<id>` names: its folder holds the snapshot of round 1. */
	named: { name: string; lotFolder: string; eventsFile: string }
}
