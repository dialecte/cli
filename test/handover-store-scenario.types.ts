/** What a `handover run` printed. */
export type RunOutcome = { exitCode: number; lines: string[]; text: string }

/** An entry of the store as the cli registers it. */
export type StoreEntryFields = {
	folder: string
	branch: string
	worktree: string
	written: string
	state: string
}
