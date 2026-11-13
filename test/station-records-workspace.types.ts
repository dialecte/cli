import type { StationLot } from './lot-station-workspace.types.ts'

/** A station run of a lot's events: its seconds on the test day (the clock starts at 10:00:00); `end: null` is an open run. */
export type StationMoveParams = {
	lot: StationLot
	station: string
	step?: number
	round?: number
	verdict?: string
	exit?: number
	start: number
	end: number | null
	/** The worktree's cli writes no step events (the envelope's `worktreeCli`). */
	noStepEvents?: boolean
	/** Left out: `run-<station>-<start>`. */
	run?: string
	/** The `stateHash` of the end (D29); left out: the end holds none. */
	stateHash?: string
	/** The end names its run only, as `lot station end --run` writes it: no `step`, no `round` on the end line. */
	endWithoutPosition?: boolean
}

/** A cli step run of a lot's events (`tdd-red`, `gate-fast`, ...) at the seconds given. */
export type CheckMoveParams = {
	lot: StationLot
	check: string
	exit?: number
	throwaway?: boolean
	/** The worktree the step ran in; the lot's own unless said. */
	worktree?: string
	/** The step was interrupted: its end holds an `outcome` and no `exit`. */
	interrupted?: boolean
	/** The `stateHash` of the step end (D29); left out: none. */
	stateHash?: string
	start: number
	end: number
	noStepEvents?: boolean
}

/** A worktree's record: a gate record of a mode at a second, green or not. */
export type GateRecordParams = {
	lot: StationLot
	mode: 'fast' | 'full' | 'contrib'
	second: number
	/** Every step passed (the default) or one failed. */
	passed?: boolean
	/** The recorded steps' statuses, instead of `passed`. */
	statuses?: string[]
}

/**
 * One move of a lot's story: each takes two seconds of the test day, the first move starting at second 1. A station
 * run starts at the move's first second and ends at its second; a record or a snapshot sits at its second.
 */
export type Move =
	| {
			station: string
			step?: number
			round?: number
			verdict?: string
			exit?: number
			stateHash?: string
	  }
	| { open: string; step?: number; round?: number }
	| { check: string; exit?: number; throwaway?: boolean; worktree?: string; stateHash?: string }
	| { snapshot: number }
	| { ledger: 'red' | 'freeze' | 'green' }
	| { gate: 'fast' | 'full' | 'contrib'; passed?: boolean; statuses?: string[] }
