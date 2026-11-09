/** An answer of the proof's table: the text, and who gives it when it is not the caller. */
export type AnswerRow = { answer: string; by?: string }

/** The status JSON fields the loop reads. */
export type LoopStatus = {
	questions?: { id: string; audience: 'caller' | 'person' }[]
}

/** What a wait of the loop told: its exit code and the status JSON's state and open questions. */
export type WaitObservation = {
	code: number
	lot: string
}

/** What the loop driving one lot did: the exit code of each wait and the answers it gave. */
export type ScenarioRun = {
	codes: number[]
	/** `<audience>:<exit code>` per answer given, sorted. */
	answers: string[]
}

/** The real `lot start` after the simulated ones: its exit code, runner and whether the worktree is on disk. */
export type RealStartOutcome = {
	exitCode: number
	runner: string | undefined
	worktreeMade: boolean
}
