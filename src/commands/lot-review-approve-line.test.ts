/** `dialecte lot review`: the approve line gives the same answer `lot approve` would. */
import { recordingHost } from '../../test/land-lot.ts'
import { LOT_NAME } from '../../test/lot-pr.constants.ts'
import { REVIEW_PULL_NUMBER } from '../../test/lot-review.constants.ts'
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
				existing: { ...lot.pullRequest, state: 'closed' },
				checks: { head: lot.head, state: 'green', failing: [], pending: [] },
			})

			const result = runLotReview({
				cwd: lot.workspace.repository,
				argv: [LOT_NAME, '--no-open'],
				host,
			})

			expect(result.output.split('\n')).toContain(
				`approve: would refuse: pull request #${REVIEW_PULL_NUMBER} is closed`,
			)
		})
	},
)
