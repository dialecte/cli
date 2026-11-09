/**
 * The stream a lot verb's or the inbox's result is printed on (33S section 6): one rule for `lot` and `inbox`.
 * Imports nothing that starts a process, so the read verbs may use it.
 */
import { HOST_VERB_ERROR_EXITS } from './lot.constants.ts'

/**
 * Whether the result goes to standard error: a host verb's (or the inbox's) answer exits go to standard output and
 * only its error exits to standard error; any other verb's non-zero exit is an error.
 */
export function printsOnStandardError(params: {
	verb: string | undefined
	exitCode: number
}): boolean {
	if (params.exitCode === 0) return false
	const errorExits = params.verb === undefined ? undefined : HOST_VERB_ERROR_EXITS[params.verb]
	return errorExits === undefined || errorExits.includes(params.exitCode)
}
