import type { QuestionLotParams } from './lot-questions.types.ts'

/** What a wait of a real lot reported, and what it left behind. */
export type Observed = {
	exitCode: number
	state: unknown
	sleeps: number[]
	/** Nothing but what the test itself wrote was written. */
	onlyTheTestWrote: boolean
}

/** A real lot a wait returns on at once: how it is made, the exit code and the state the wait reports. */
export type AtOnceRow = { title: string; lot: QuestionLotParams; exitCode: number; state: string }
