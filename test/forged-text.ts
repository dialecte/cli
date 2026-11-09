/** What a printed text must not hold when it quotes forged text: a raw control character or a forged line. */
import { outcomeOf } from './call-outcome.ts'
import { FORGED_MARK, FORGED_TAILS } from './lot-printed-fields.constants.ts'
import { unsafeCharactersIn } from './unsafe-characters.ts'

import type { CommandResult } from '../src/lib/command-result.types.ts'

/**
 * The faults of a printed text: its raw unsafe characters (a carriage return, an escape, an override), and the
 * lines that begin with a forged tail or with the forged mark. None when it is safe to print.
 */
export function forgedFaultsOf(text: string): string[] {
	const lines = text.split('\n')
	return [
		...unsafeCharactersIn({ text, lines: lines.length }).map((character) =>
			JSON.stringify(character),
		),
		...lines.filter(
			(line) => line.startsWith(FORGED_MARK) || FORGED_TAILS.some((tail) => line.startsWith(tail)),
		),
	]
}

/** The faults of what a command printed: its output, or the message of the error it threw. */
export function forgedFaultsOfCall(call: () => CommandResult): string[] {
	const outcome = outcomeOf(call)
	return forgedFaultsOf('value' in outcome ? outcome.value.output : outcome.error)
}
