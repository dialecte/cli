/** The `onAnswered` hook list (33S section 4): empty in S, `registerAnswerHook` is how a later lot adds to it. */
import type { AnswerHook, AnswerHookInput } from './answer-hooks.types.ts'

/** The hooks registered, in order; each entry is its own object so removing one never removes a twin. */
const registered: Array<{ hook: AnswerHook }> = []

/** Adds `hook` to the list, after the hooks already there; returns the function that removes it again. */
export function registerAnswerHook(params: { hook: AnswerHook }): () => void {
	const entry = { hook: params.hook }
	registered.push(entry)
	return function removeAnswerHook() {
		const position = registered.indexOf(entry)
		if (position !== -1) registered.splice(position, 1)
	}
}

/**
 * Runs the hooks in the order registered with `input`. The first that throws stops the ones after it; its error
 * is thrown again as a plain `Error` holding its message (never mistaken for a store refusal).
 */
export function runAnswerHooks(input: AnswerHookInput): void {
	// a copy: a hook that removes itself (or another) while the list runs never skips the next one
	for (const { hook } of registered.slice())
		try {
			hook(input)
		} catch (error) {
			throw new Error(error instanceof Error ? error.message : String(error), { cause: error })
		}
}
