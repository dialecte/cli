/** The writer a lock file names: its pid and that process's start time (an older lock, or an unreadable line: none). */
export type LockWriter = {
	pid: number | undefined
	started: string | undefined
}
