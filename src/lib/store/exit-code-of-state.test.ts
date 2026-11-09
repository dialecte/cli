/**
 * `exitCodeOfState` (33S section 6, G17): the one table of the exit codes `wait` and `result` derive from a lot's
 * state, every row of the `wait` and `result` columns.
 */
import { exitCodeOfState } from './exit-code-of-state.ts'

import { describe, expect, it } from 'vitest'

import type { StateExitParams } from './exit-code-of-state.types.ts'

type Row = StateExitParams & { code: number }

const WAIT_ROWS: Row[] = [
	{ verb: 'wait', state: 'ready', limit: false, timedOut: false, code: 0 },
	{ verb: 'wait', state: 'committed', limit: false, timedOut: false, code: 0 },
	{ verb: 'wait', state: 'failed', limit: false, timedOut: false, code: 1 },
	{ verb: 'wait', state: 'canceled', limit: false, timedOut: false, code: 1 },
	{ verb: 'wait', state: 'input-required', limit: false, timedOut: false, code: 3 },
	{ verb: 'wait', state: 'working', limit: true, timedOut: false, code: 4 },
	{ verb: 'wait', state: 'working', limit: false, timedOut: true, code: 5 },
	{ verb: 'wait', state: 'failed', limit: false, timedOut: true, code: 1 },
	{ verb: 'wait', state: 'input-required', limit: false, timedOut: true, code: 3 },
	{ verb: 'wait', state: 'ready', limit: false, timedOut: true, code: 0 },
]

const RESULT_ROWS: Row[] = [
	{ verb: 'result', state: 'ready', limit: false, timedOut: false, code: 0 },
	{ verb: 'result', state: 'committed', limit: false, timedOut: false, code: 0 },
	{ verb: 'result', state: 'failed', limit: false, timedOut: false, code: 1 },
	{ verb: 'result', state: 'canceled', limit: false, timedOut: false, code: 1 },
	{ verb: 'result', state: 'input-required', limit: false, timedOut: false, code: 3 },
	{ verb: 'result', state: 'working', limit: false, timedOut: false, code: 5 },
	{ verb: 'result', state: 'working', limit: true, timedOut: false, code: 5 },
]

describe('exitCodeOfState', () => {
	for (const row of [...WAIT_ROWS, ...RESULT_ROWS])
		it(`${row.verb}, ${row.state}${row.limit ? ', last transition a limit' : ''}${row.timedOut ? ', timed out' : ''} -> exit ${row.code}`, () => {
			const { code, ...params } = row

			expect(exitCodeOfState(params)).toBe(code)
		})
})
