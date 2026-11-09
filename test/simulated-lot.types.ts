import type { WaitClock, WaitSleep } from '../src/commands/lot-wait.types.ts'
import type { CommandResult } from '../src/lib/command-result.types.ts'
import type { StartWorkspace } from './lot-start-workspace.types.ts'

/** What a `lot wait --json` ended with: its exit code and the state it reported. */
export type Ended = { exitCode: number; state: unknown }

/** A clock and sleep that move together by hand, and the lengths of the sleeps asked for. */
export type WaitTime = {
	clock: WaitClock
	sleep: WaitSleep
	/** Each sleep's milliseconds, in order. */
	sleeps: number[]
}

/** A simulated lot started in a scratch workspace: the workspace, the lot folder (real path) and the start's result. */
export type SimulatedLot = {
	start: StartWorkspace
	lotFolder: string
	started: CommandResult
}

/** A command's exit code and its output read as JSON (undefined when it is not). */
export type JsonResult = { exitCode: number; json: unknown }

/** A step of a flow: a wait with its words after the id, or an answer with its words after the verb. */
export type FlowStep = { wait: string[] } | { answer: string[] }

/** What a list of exit codes of repeated waits shows. */
export type LoopShape = {
	first: number | undefined
	last: number | undefined
	onlyFivesBeforeTheLast: boolean
	moreThanOneWait: boolean
}
