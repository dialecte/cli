/**
 * The exits of the host verbs that print on standard error (33S section 6, the inbox's convention): a usage error
 * or a refusal (2), and `answer`'s hook that threw after the answer was recorded (1). Every other exit of these
 * verbs is an answer a host reads, printed on standard output; a lot verb not listed prints every non-zero exit on
 * standard error. `inbox` follows the same rule: its exit 1 (nothing waits) is an answer.
 */
export const HOST_VERB_ERROR_EXITS: Readonly<Record<string, readonly number[]>> = {
	inbox: [2],
	status: [2],
	wait: [2],
	answer: [1, 2],
	result: [2],
	stop: [2],
}
