/**
 * The `next` lines S2's verbs close (33S section 7, G14): a failed lot's `next` is `dialecte lot stop <name> --reason
 * <text>` and a simulated lot that played to `ready` without a registry entry points at `dialecte lot result <name>`;
 * each is run here as a host would, with the placeholder filled, and does what it says.
 */
import { QUESTION_LOT } from '../../test/lot-questions.constants.ts'
import { createQuestionLot, transitionFilesOf } from '../../test/lot-questions.ts'
import { LOT_NAME } from '../../test/lot-start.constants.ts'
import { STOP_NOW } from '../../test/lot-stop-workspace.constants.ts'
import { createWaitTime, startSimulated, waitSimulated } from '../../test/simulated-lot.ts'
import { LATER_TIME } from '../../test/store-records.constants.ts'
import { transitionOf } from '../../test/store-records.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { lotStatusOf } from './lot-status.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const LOT_COMMAND_PREFIX = 'dialecte lot '
const REASON_PLACEHOLDER = '<text>'
const FILLED_REASON = 'abandoned'

/** The words after `dialecte lot ` of a `next` line, a placeholder given its value. */
function argvOfNext(params: {
	next: string | null | undefined
	placeholder?: string
	value?: string
}) {
	const line = params.next ?? ''
	const filled = params.placeholder ? line.replace(params.placeholder, params.value ?? '') : line
	return filled.slice(LOT_COMMAND_PREFIX.length).split(' ')
}

describe('the next line of a failed lot', { timeout: STORE_CASE_TIMEOUT }, () => {
	function failedLot() {
		return createQuestionLot({
			later: [transitionOf({ seq: 2, state: 'failed', kind: 'fail', at: LATER_TIME })],
		})
	}

	it('a failed lot -> next is the stop line with the full name; that line, a reason filled in, run -> exit 0 and the lot is canceled with that reason', () => {
		const lot = failedLot()
		const status = lotStatusOf({ lotFolder: lot.lotFolder })

		expect(status).toMatchObject({
			state: 'failed',
			next: `dialecte lot stop ${QUESTION_LOT} --reason <text>`,
		})
		expect(
			runLot({
				cwd: lot.workspace.repository,
				argv: argvOfNext({
					next: status?.next,
					placeholder: REASON_PLACEHOLDER,
					value: FILLED_REASON,
				}),
				now: STOP_NOW,
			}),
		).toMatchObject({ exitCode: 0 })

		expect(transitionFilesOf(lot.lotFolder).at(-1)).toMatchObject({
			state: 'canceled',
			cause: { kind: 'stop', reason: FILLED_REASON },
		})
	})
})

describe(
	'the next line of a simulated lot that played to ready',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('a simulated lot ready, no registry entry -> next is the result line; run -> exit 0', async () => {
			const simulated = startSimulated({ scenario: 'ready' })
			await waitSimulated({ lot: simulated, time: createWaitTime() })
			const status = lotStatusOf({ lotFolder: simulated.lotFolder })

			expect(status).toMatchObject({ state: 'ready', next: `dialecte lot result ${LOT_NAME}` })
			expect(
				runLot({ cwd: simulated.start.repository, argv: argvOfNext({ next: status?.next }) }),
			).toMatchObject({ exitCode: 0 })
		})
	},
)
