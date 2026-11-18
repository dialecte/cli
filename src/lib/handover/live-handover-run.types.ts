/** A hand-over run in progress: the folder of its hand-over. */
export type LiveHandoverRun = { folder: string }

/**
 * The marker a rehearsal writes in its clone's git folder (`REHEARSAL_MARKER_FILE`): the owner's pid and process
 * start time, when the clone was made, and the real path of the hand-over folder it rehearses. Without `startTime`
 * (none could be read) it reads as no live run.
 */
export type RehearsalMarker = {
	pid: number
	/** When the clone was made, ISO 8601; never compared with a process start time. */
	startedAt: string
	handover: string
	/** The owner's start time as `processStartTime` reads it. */
	startTime?: string
}

/**
 * A rehearsal marker read three ways: `alive` with the owner's pid and the hand-over folder it names (when it names
 * one); `dead` with the pid it named; `unknown` with why (no marker, an unparsable one, no pid, no start time to
 * compare). An unknown answer is never read as no run by a verb that deletes.
 */
export type RehearsalRun =
	| { state: 'alive'; pid: number; handover: string | undefined }
	| { state: 'dead'; pid: number }
	| { state: 'unknown'; why: string; pid: number | undefined }

/** What a rehearsal marker says of its owner: `alive` (running with the start time the marker holds), `dead` (gone, or its pid reused), `unknown` (it cannot tell). */
export type RehearsalRunState = RehearsalRun['state']
