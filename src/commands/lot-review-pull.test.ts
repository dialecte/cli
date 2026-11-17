/**
 * `dialecte lot review <id> --pull --round <n>`: the pull request's line comments come back as findings of the lot's
 * ledger, each once, so the lot fixes them as a review round.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { recordingHost } from '../../test/land-lot.ts'
import { LOT_NAME } from '../../test/lot-pr.constants.ts'
import { REVIEW_PULL_NUMBER } from '../../test/lot-review.constants.ts'
import { landedLot } from '../../test/lot-review.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { readReviewRecord } from '../lib/review-rounds/review-record.ts'
import { LEDGER_FILE } from '../lib/review-rounds/review-rounds.constants.ts'
import { runLotReview } from './lot-review.ts'

import { describe, expect, it } from 'vitest'

import type { ReviewComment } from '../lib/host/host.types.ts'

/** A thread's first comment on `src/x.ts` at line 1, and a reply to it. */
const COMMENTS: ReviewComment[] = [
	{ id: 101, path: 'src/x.ts', line: 1, body: 'blocking: x must be two' },
	{ id: 102, path: 'src/x.ts', line: 1, body: 'nit: agreed, and a word', replyTo: 101 },
	{ id: 103, path: 'changes/x.md', body: 'Nit:  the fragment reads oddly' },
	{ id: 104, path: 'src/x.ts', line: 1, body: 'a plain remark\non two lines | with a pipe' },
]

/** The ledger's rows as written, below its header. */
function ledgerRows(folder: string): string[] {
	return readFileSync(join(folder, LEDGER_FILE), 'utf8')
		.split('\n')
		.filter((line) => /^\| R\d/.test(line))
}

describe('dialecte lot review --pull', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('line comments → findings of the round at their file and line, severity from their first word, replies left out', () => {
		const lot = landedLot()
		const { host, calls } = recordingHost({ existing: lot.pullRequest, comments: COMMENTS })

		const result = runLotReview({
			cwd: lot.workspace.repository,
			argv: [LOT_NAME, '--pull', '--round', '2'],
			host,
		})

		expect(result.exitCode).toBe(0)
		expect(calls).toEqual([`read ${REVIEW_PULL_NUMBER}`, `comments ${REVIEW_PULL_NUMBER}`])
		expect(ledgerRows(lot.lotFolder)).toEqual([
			'| R2-1 | 2 | blocking | src/x.ts:1 | x must be two | open |',
			'| R2-2 | 2 | nit | changes/x.md | the fragment reads oddly | open |',
			'| R2-3 | 2 | should fix | src/x.ts:1 | a plain remark on two lines \\| with a pipe | open |',
		])
		expect(result.output.split('\n').filter((line) => line !== '')).toEqual([
			'lot review: R2-1 blocking src/x.ts:1 from comment 101',
			'lot review: R2-2 nit changes/x.md from comment 103',
			'lot review: R2-3 should-fix src/x.ts:1 from comment 104',
		])
		expect(readReviewRecord({ folder: lot.lotFolder })?.findings.map((row) => row.id)).toEqual([
			'R2-1',
			'R2-2',
			'R2-3',
		])
	})

	it('the same comments pulled again → already, nothing added', () => {
		const lot = landedLot()
		const { host } = recordingHost({ existing: lot.pullRequest, comments: COMMENTS })
		const first = runLotReview({
			cwd: lot.workspace.repository,
			argv: [LOT_NAME, '--pull', '--round', '2'],
			host,
		})
		expect(first.exitCode).toBe(0)
		const before = readFileSync(join(lot.lotFolder, LEDGER_FILE), 'utf8')

		const result = runLotReview({
			cwd: lot.workspace.repository,
			argv: [LOT_NAME, '--pull', '--round', '3'],
			host,
		})

		expect(result.exitCode).toBe(0)
		expect(result.output.trim()).toBe(
			`lot review: already: every comment of pull request #${REVIEW_PULL_NUMBER} is a finding`,
		)
		expect(readFileSync(join(lot.lotFolder, LEDGER_FILE), 'utf8')).toBe(before)
	})

	it('--pull without --round → usage, exit 2, nothing asked or written', () => {
		const lot = landedLot()
		const { host, calls } = recordingHost({ existing: lot.pullRequest, comments: COMMENTS })

		const result = runLotReview({
			cwd: lot.workspace.repository,
			argv: [LOT_NAME, '--pull'],
			host,
		})

		expect(result.exitCode).toBe(2)
		expect(result.output).toContain('review <id> --pull --round <n>')
		expect(calls).toEqual([])
		expect(existsSync(join(lot.lotFolder, LEDGER_FILE))).toBe(false)
	})
})
