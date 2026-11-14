/**
 * What the install guard decided for the lot about to be committed: `ok` (nothing to check, or `node_modules` as
 * the lock the commit will hold), or a `refusal` (the first line of the lot's failure, after `✗ lot <n> not
 * committed: `) with the `lines` that follow it (one per mismatched package, at most 5, then `and <k> more`).
 */
export type InstallGuardResult = ({ ok: true } | { refusal: string; lines: string[] }) & {
	/** The `!` line when the record could not be written (the check stands). */
	warning?: string
}

/** The guard's record in the hand-over folder (`install.json`), replaced whole after each lot's check. */
export type InstallRecord = {
	/** ISO wall-clock time of the check (`now().toISOString()`), never the progress clock. */
	at: string
	/** sha256 of the bytes of the lock checked: the index's `package-lock.json`. */
	lock: string
	/**
	 * sha256 of the raw bytes of the repository worktree's `package-lock.json` when the check ran; left out when it
	 * held none. The card shows the record while the worktree's lock still hashes to it.
	 */
	working?: string
	ok: boolean
	/**
	 * `true` when the guard refused with the later-lot text: the working lock differed from the index lock for git
	 * (`git diff --quiet`). The guard writes no other value and leaves it out of every other record; a reader takes a
	 * boolean (any other value: no line).
	 */
	laterLock?: boolean
	/** How many packages differ from the lock (0 when ok; the reason's count when the lock was unreadable). */
	mismatched: number
}

/** What one check found, written into the record beside its time and hashes. */
export type InstallOutcome = Pick<InstallRecord, 'ok' | 'mismatched' | 'laterLock'>
