/**
 * `dialecte lot review <id> --pull --round <n>`: the host refusing the pull request or its comments → exit 1 naming
 * the refusal, nothing written.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { recordingHost } from '../../test/land-lot.ts'
import { LOT_NAME } from '../../test/lot-pr.constants.ts'
import { landedLot } from '../../test/lot-review.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { LEDGER_FILE } from '../lib/review-rounds/review-rounds.constants.ts'
import { STORE_FILES } from '../lib/store/store.constants.ts'
import { runLotReview } from './lot-review.ts'

import { describe, expect, it } from 'vitest'

import type { HostAdapter } from '../lib/host/host.types.ts'

describe('dialecte lot review --pull: host refusals', { timeout: STORE_CASE_TIMEOUT }, () => {
	it.each([
		{
			label: 'the pull request',
			refuse: { readPullRequest: () => ({ refusal: 'gh pr view: exit 1' }) },
			line: 'lot review: gh pr view: exit 1',
		},
		{
			label: 'the line comments',
			refuse: { readReviewComments: () => ({ refusal: 'gh api: exit 1' }) },
			line: 'lot review: gh api: exit 1',
		},
	] satisfies { label: string; refuse: Partial<HostAdapter>; line: string }[])(
		'the host refusing $label → exit 1 naming the refusal, no finding written',
		({ refuse, line }) => {
			const lot = landedLot()
			const { host } = recordingHost({
				existing: lot.pullRequest,
				comments: [{ id: 101, path: 'src/x.ts', line: 1, body: 'blocking: x must be two' }],
			})

			const result = runLotReview({
				cwd: lot.workspace.repository,
				argv: [LOT_NAME, '--pull', '--round', '2'],
				host: { ...host, ...refuse },
			})

			expect(result.exitCode).toBe(1)
			expect(result.output.trim()).toBe(line)
			expect(existsSync(join(lot.lotFolder, LEDGER_FILE))).toBe(false)
			expect(existsSync(join(lot.lotFolder, STORE_FILES.pulledComments))).toBe(false)
		},
	)
})
