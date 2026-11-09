import type { AnswerRow } from './scenario-proof.types.ts'

/** The fixed answer table of the proof: a caller's question is kept (no `--by`), a person's is accepted by a person. */
export const ANSWER_TABLE: Readonly<Record<'caller' | 'person', AnswerRow>> = {
	caller: { answer: 'keep' },
	person: { answer: 'accept', by: 'a-person' },
}

/** The most waits one scenario's loop makes before the case gives up (a lot that never ends fails the case, not the run). */
export const PROOF_TURN_LIMIT = 60

/** The seconds a wait may last in the proof; `slow` waits one second at a time. */
export const PROOF_TIMEOUT_SECONDS = '120'
export const SLOW_TIMEOUT_SECONDS = '1'

/** The exit codes each scenario's waits end with, in order (33S section 8); `slow` is checked by its shape. */
export const PREDICTED_CODES: Readonly<Record<string, readonly number[]>> = {
	ready: [0],
	question: [3, 0],
	person: [3, 0],
	'two-questions': [3, 0],
	limit: [4, 0],
	failure: [1],
}

/** The answers each scenario's loop gives: `<audience>:<exit code>` per question, sorted. */
export const PREDICTED_ANSWERS: Readonly<Record<string, readonly string[]>> = {
	ready: [],
	question: ['caller:0'],
	person: ['person:0'],
	'two-questions': ['caller:0', 'person:0'],
	limit: [],
	failure: [],
	slow: [],
}

/** What the inbox says of a lot at the exit code of its wait: its state in the waiting list (`absent` when it is not there), and whether the text lists it. */
export const INBOX_SAYS: Readonly<Record<number, string>> = {
	0: 'ready:true',
	1: 'failed:true',
	3: 'input-required:true',
	4: 'absent:false',
	5: 'absent:false',
}

/** What a well-formed observation of the inbox looks like: a state or `absent`, and whether the text lists the lot. */
export const INBOX_SAYS_PATTERN =
	/^(absent|working|input-required|ready|failed|canceled|committed):(true|false)$/

/** The shape the waits of `slow` take: 5 until the lot is ready, then 0. */
export const SLOW_SHAPE = {
	first: 5,
	last: 0,
	onlyFivesBeforeTheLast: true,
	moreThanOneWait: true,
}
