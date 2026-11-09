/** The one table of the exit codes `wait` and `result` derive from a lot's state (33S section 6). */
import type { StateExitCode, StateExitParams } from './exit-code-of-state.types.ts'

/**
 * The exit code of `wait` or `result` for a state: 0 ready or committed, 1 failed or canceled, 3 input-required;
 * a working lot: 4 for `wait` when its last transition is a `limit`, else 5 (`wait` timed out, `result` still
 * working). A `wait` on a working lot with no limit that has not timed out has no exit code yet: it throws, the
 * wait loop goes on instead of asking. Pure.
 */
export function exitCodeOfState(params: StateExitParams): StateExitCode {
	const { state } = params
	if (state === 'ready' || state === 'committed') return 0
	if (state === 'failed' || state === 'canceled') return 1
	if (state === 'input-required') return 3
	if (params.verb === 'result') return 5
	if (params.limit) return 4
	if (params.timedOut) return 5
	throw new Error('lot wait: a working lot with no limit answers only once --timeout is reached')
}
