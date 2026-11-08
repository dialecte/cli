/** Runs a call so that an error it throws is an assertion's mismatch, not a failure of the case before any assertion. */
import type { CallOutcome } from './call-outcome.types.ts'

/** The value `call` returns, or the message of the error it throws. */
export function outcomeOf<Value>(call: () => Value): CallOutcome<Value> {
	try {
		return { value: call() }
	} catch (error) {
		return { error: error instanceof Error ? error.message : String(error) }
	}
}
