import type { StateFolderLocation } from '../store/store.types.ts'

/** What a live marker holds: one heavy step running now, machine-wide. */
export type HeavyMarker = {
	step: string
	lot: string | null
	repository: string
	worktree: string
	pid: number
	/** `processStartTime` of the writer, as read once per process. */
	startTime: string
	/** ISO time the marker was written. */
	started: string
}

/** What tells whether a marker's process still runs: injected by the tests only. */
export type HeavyMarkerCheck = {
	isAlive?: (pid: number) => boolean
	startTimeOf?: (pid: number) => string | undefined
}

/** Where the state folder comes from: the process's environment and home unless given. */
export type HeavyMarkerLocation = StateFolderLocation

/** What a heavy step's marker holds (the pid and start time are the process's), and where it goes. */
export type WriteHeavyMarkerParams = HeavyMarkerLocation & {
	step: string
	lot: string | null
	repository: string
	worktree: string
	check?: HeavyMarkerCheck
	now?: Date
}
