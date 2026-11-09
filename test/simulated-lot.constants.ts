/** The questions the scenarios ask, exactly (33S section 8). */
export const CALLER_QUESTION = {
	audience: 'caller',
	text: 'keep an existing entry as it is?',
	options: ['keep', 'replace'],
} as const
export const PERSON_QUESTION = {
	audience: 'person',
	text: 'R1-2 kept by the adjudicator: accept or fix?',
	options: ['accept', 'fix'],
} as const

/** The reason of the `failure` scenario's `failed` transition. */
export const FAILURE_REASON = 'the full gate failed (simulated)'

/** How long each step of `slow` is due after the previous transition, in milliseconds. */
export const SLOW_DURATION_MS = 2000

/** The most `wait --timeout 1` calls a loop makes before it gives up (a never-ending wait fails the case, not the run). */
export const WAIT_LOOP_LIMIT = 40

/** The refreshing line of `wait` on a terminal, up to its elapsed time. */
export const WAITING_LINE_PATTERN =
	/\rwaiting 0001-repo-dataflow-subscribe \(working, [\d. ]+[smh]\)/

/** The refreshing line of `wait` on a terminal for the hand-written real lot of the wait tests. */
export const REAL_WAITING_LINE_PATTERN = /\rwaiting 0007-repo-feature \(working, [\d. ]+[smh]\)/

/** The pause before the one re-read of a lot whose only evidence of `canceled` is `abandoned.json`, and the poll of a real lot. */
export const REREAD_PAUSE_MS = 100
export const POLL_MS = 1000

/** The permission bits of a mode, and the mode of a record published read-only. */
export const PERMISSION_BITS = 0o777
export const READ_ONLY_MODE = 0o444

/** The lot a hand-written real lot of the wait tests is named (index 0007). */
export const WAIT_LOT_ID = '0007-repo-feature'

/** The summary of the transitions of a lot played to the end of `ready`: `<seq>:<state>:<cause>:<station>`. */
export const READY_SUMMARY: readonly string[] = [
	'1:working:start:null',
	'2:working:station:test-writer',
	'3:working:station:test-reviewer',
	'4:working:station:implementer',
	'5:working:station:reviewer',
	'6:working:station:hand-over',
	'7:ready:ready:hand-over',
]
