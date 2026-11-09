import type { LotStateName } from './store.types.ts'

/** The verbs whose exit code comes from the lot's state (33S section 6). */
export type StateExitVerb = 'wait' | 'result'

/** The exit codes of `wait` and `result`: 0 ready or committed, 1 failed or canceled, 3 input-required, 4 limit, 5 timeout or working. */
export type StateExitCode = 0 | 1 | 3 | 4 | 5

/** What the exit code is derived from. */
export type StateExitParams = {
	verb: StateExitVerb
	state: LotStateName
	/** The last transition's cause is a `limit`. */
	limit: boolean
	/** `wait`'s `--timeout` was reached. */
	timedOut: boolean
}
