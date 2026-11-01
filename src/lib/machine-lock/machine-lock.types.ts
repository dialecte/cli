import type { WriteLine } from '../handover/handover.types.ts'
import type { Clock } from '../progress/clock.types.ts'

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
	| {
			acquired: true
			/**
			 * The `DIALECTE_MACHINE_LOCK_HOLDER` value naming the holder the lock file names (this process, or
			 * the holder it runs under), for the commands run under the lock.
			 */
			holderVariable: string
			release(): void
	  }
	| { acquired: false; holder: MachineLockHolder }

/** The steps of a takeover a test can interleave other callers at. */
export type TakeoverStep = 'holding the takeover' | 'stale lock removed'

/** The machine lock taken for a run: what releases it, and the holder variable its children get. */
export type HeldMachineLock = {
	release(): void
	/** `DIALECTE_MACHINE_LOCK_HOLDER` for the commands run under it; none when no lock was taken. */
	holderVariable?: string
}

/** The machine lock taken, or why not (`--no-wait` and another holder). */
export type MachineLockTaken = HeldMachineLock | { refusal: string }

/** How a command reaches the machine lock: its file, the clock it waits with, where its waiting lines go. */
export type MachineLockAccess = {
	path: string
	clock: Clock
	write: WriteLine
	isAlive?: (pid: number) => boolean
}
