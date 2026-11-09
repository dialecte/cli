/** Registers an `onAnswered` hook for the length of one action, then removes it, so no test leaves a hook behind. */
import { registerAnswerHook } from '../src/lib/store/answer-hooks.ts'

import type { AnswerHook } from '../src/lib/store/answer-hooks.types.ts'

/** The value `action` returns, with `hooks` registered in order while it runs. */
export function withAnswerHooks<Value>(params: {
	hooks: AnswerHook[]
	action: () => Value
}): Value {
	const removers = params.hooks.map((hook) => registerAnswerHook({ hook }))
	try {
		return params.action()
	} finally {
		for (const remove of removers) remove()
	}
}
