/** `dialecte lot review`: the approve line gives the same answer `lot approve` would. */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { recordingHost } from '../../test/land-lot.ts'
import { LOT_NAME } from '../../test/lot-describe.constants.ts'
import { REVIEW_CHANGE_REQUEST_NUMBER } from '../../test/lot-review.constants.ts'
import { landedLot } from '../../test/lot-review.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runLotReview } from './lot-review.ts'

import { describe, expect, it } from 'vitest'

describe(
	'dialecte lot review: the approve line answers as lot approve',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('a closed pull request with green checks → approve would refuse, it is closed', () => {
			const lot = landedLot()
			const { host } = recordingHost({
				existing: { ...lot.changeRequest, state: 'closed' },
				checks: { head: lot.head, state: 'green', failing: [], pending: [] },
			})

			const result = runLotReview({
				cwd: lot.workspace.repository,
				argv: [LOT_NAME, '--no-open'],
				host,
			})

			expect(result.output.split('\n')).toContain(
				`approve: would refuse: change request #${REVIEW_CHANGE_REQUEST_NUMBER} is closed`,
			)
		})

		it('green checks, a torn stack record → approve would refuse naming its damage, as lot approve does', () => {
			const lot = landedLot()
			writeFileSync(join(lot.lotFolder, 'stack.json'), '{"schema":1,"parent":')
			const { host } = recordingHost({
				existing: lot.changeRequest,
				checks: { head: lot.head, state: 'green', failing: [], pending: [] },
			})

			const result = runLotReview({
				cwd: lot.workspace.repository,
				argv: [LOT_NAME, '--no-open'],
				host,
			})

			expect(result.output.split('\n')).toContainEqual(
				expect.stringMatching(
					new RegExp(`^approve: would refuse: .*${LOT_NAME} is damaged: its stack\\.json`),
				),
			)
		})

		it.each([
			{
				answer: 'no queue',
				queueKind: { kind: 'none', noun: 'no queue' },
				line: 'approve: would refuse: the host queues no change request here: it allows no auto-merge and its base branch has no queue; turn one on, then approve again',
			},
			{
				answer: 'a refused read',
				queueKind: { refusal: 'gh api graphql: HTTP 502' },
				line: `approve: ready: dialecte lot approve ${LOT_NAME} --by <who>`,
			},
		] as const)(
			'green checks, the host answering $answer for the queue → $line',
			({ queueKind, line }) => {
				const lot = landedLot()
				const { host } = recordingHost({
					existing: lot.changeRequest,
					checks: { head: lot.head, state: 'green', failing: [], pending: [] },
					queueKind,
				})

				const result = runLotReview({
					cwd: lot.workspace.repository,
					argv: [LOT_NAME, '--no-open'],
					host,
				})

				expect(result.output.split('\n')).toContain(line)
			},
		)
	},
)
