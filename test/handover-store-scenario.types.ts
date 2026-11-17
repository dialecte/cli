import type { BackgroundSpawner } from '../src/lib/worktree/worktree.types.ts'

/** What a `handover run` printed. */
export type RunOutcome = {
	exitCode: number
	lines: string[]
	text: string
	/** The background removals the run asked for (a rehearsal's trash), recorded: never started by the suite. */
	removals: Parameters<BackgroundSpawner>[0][]
}

/** An entry of the store as the cli registers it. */
export type StoreEntryFields = {
	folder: string
	branch: string
	worktree: string
	written: string
	state: string
}
