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
