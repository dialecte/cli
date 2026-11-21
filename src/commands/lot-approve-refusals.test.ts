/**
 * `dialecte lot approve`: a lot no longer at work and an approver a public record never holds are refused, nothing
 * recorded or queued; `lot review`'s approve line names the lot's state the same way.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { recordingHost } from '../../test/land-lot.ts'
import { FORBIDDEN_WORD, LOT_NAME } from '../../test/lot-pr.constants.ts'
import { REVIEWER } from '../../test/lot-review.constants.ts'
import { landedLot } from '../../test/lot-review.ts'
import { git } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { STORE_FILES } from '../lib/store/store.constants.ts'
import { runLotApprove } from './lot-approve.ts'
import { runLotReview } from './lot-review.ts'

import { describe, expect, it } from 'vitest'

describe('dialecte lot approve: refusals', { timeout: STORE_CASE_TIMEOUT }, () => {
	it.each(['committed', 'canceled', 'failed'] as const)(
		'a %s lot with green checks → refused naming its state before the host is asked, nothing recorded',
		(state) => {
			const lot = landedLot({ state })
			const { host, calls } = recordingHost({
				existing: lot.changeRequest,
				checks: { head: lot.head, state: 'green', failing: [], pending: [] },
			})

			const result = runLotApprove({
				cwd: lot.workspace.repository,
				argv: [LOT_NAME, '--by', REVIEWER],
				host,
			})

			expect(result).toEqual({
				exitCode: 1,
				output: `lot approve: ${LOT_NAME} is ${state}: only a lot at work is approved`,
			})
			expect(calls).toEqual([])
			expect(existsSync(join(lot.lotFolder, STORE_FILES.approvals))).toBe(false)
		},
	)

	it('a canceled lot with green checks → lot review: approve would refuse, the lot is canceled', () => {
		const lot = landedLot({ state: 'canceled' })
		const { host } = recordingHost({
			existing: lot.changeRequest,
			checks: { head: lot.head, state: 'green', failing: [], pending: [] },
		})

		const result = runLotReview({
			cwd: lot.workspace.repository,
			argv: [LOT_NAME, '--no-open'],
			host,
		})

		expect(result.output.split('\n')).toContain('approve: would refuse: the lot is canceled')
	})

	it('--by holding a path → refused before the host is asked, nothing recorded', () => {
		const lot = landedLot()
		const { host, calls } = recordingHost({ existing: lot.changeRequest })

		const result = runLotApprove({
			cwd: lot.workspace.repository,
			argv: [LOT_NAME, '--by', 'src/x.ts'],
			host,
		})

		expect(result).toEqual({
			exitCode: 2,
			output: 'lot approve: --by holds a path or a link: nothing written',
		})
		expect(calls).toEqual([])
		expect(existsSync(join(lot.lotFolder, STORE_FILES.approvals))).toBe(false)
	})

	it('a forbidden word in --by → refused naming --by before the host is asked, nothing recorded', () => {
		const lot = landedLot()
		git({
			root: lot.workspace.repository,
			args: ['config', 'dialecte.forbiddenWords', FORBIDDEN_WORD],
		})
		const { host, calls } = recordingHost({ existing: lot.changeRequest })

		const result = runLotApprove({
			cwd: lot.workspace.repository,
			argv: [LOT_NAME, '--by', FORBIDDEN_WORD],
			host,
		})

		expect(result.exitCode).toBe(2)
		expect(result.output).toContain('--by')
		expect(calls).toEqual([])
		expect(existsSync(join(lot.lotFolder, STORE_FILES.approvals))).toBe(false)
	})
})
