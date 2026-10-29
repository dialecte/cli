/** Who holds the machine lock: written in the lock file. */
export type MachineLockHolder = {
	pid: number
	command: string
	/** ISO date the holder took the lock. */
	startedAt: string
	/** When the holder's process started (`ps -o lstart=`): tells a reused pid from the holder. */
	processStart?: string
}

export type MachineLockOutcome =
	| { acquired: true; release(): void }
	| { acquired: false; holder: MachineLockHolder }

/** The steps of a takeover a test can interleave other callers at. */
export type TakeoverStep = 'holding the takeover' | 'stale lock removed'
