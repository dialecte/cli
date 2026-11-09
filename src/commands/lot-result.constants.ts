/** The flags `lot result` takes, without the dashes. */
export const RESULT_FLAGS: readonly string[] = ['json']

/** Why a lot canceled by its abandoned hand-over (no `canceled` transition) ended. */
export const RESULT_ABANDONED_REASON = 'its hand-over was abandoned'

/** A placeholder of a text line: `{key}`. */
export const RESULT_PLACEHOLDER_PATTERN = /\{(\w+)\}/g

/**
 * The lines of the text form of `lot result`: `{name}` is the lot's full name, `{state}` a state, `{handover}` a
 * registry name, `{command}` a command, `{at}` a time, `{reason}` and `{text}` agent text printed escaped.
 */
export const RESULT_TEXTS = {
	handover: '{name} {state}: hand-over {handover} ({handoverState})',
	simulated: '{name} {state} (simulated): no hand-over to run',
	noHandover: '{name} {state}: no hand-over registered',
	show: 'show: {command}',
	run: 'run: {command}',
	answered: '{id}: {text} -> {answer} (by {by})',
	ended: '{name} {state} at {at}: {reason}',
	question: '{id}: {text}',
	busy: '{name} {state}',
} as const
