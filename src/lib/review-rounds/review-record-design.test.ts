/**
 * `review.jsonl` holds the lot's design row once the lot recorded anything about its design (DESIGN-GATE section 4):
 * its state and who approved or waived it, the name kept only when it is a public word; never the file, its hash or a
 * reason. `lot design` writes it with each line it records.
 */
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'

import { APPROVER, WAIVER_REASON } from '../../../test/design-workspace.constants.ts'
import {
	design,
	designLinesOf,
	designLot,
	saveReadyVerdict,
} from '../../../test/design-workspace.ts'
import { reviewRowsOf, reviewTextOf } from '../../../test/review-record-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { STORE_FILES } from '../store/store.constants.ts'
import { refreshReviewRecord } from './review-record.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

describe('review.jsonl - the design row', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a design recorded then approved -> one design row, approved by the approver, no file, hash or reason', () => {
		const lot = designLot({ declared: true })
		design({ lot, words: ['--from', lot.designFile] })
		saveReadyVerdict({ designFile: lot.designFile })

		expect(
			design({ lot, words: ['--approve', '--by', APPROVER, '--reason', 'private reason'] })
				.exitCode,
		).toBe(0)
		expect(reviewRowsOf(lot.lotFolder)).toEqual([
			{ schema: 1, kind: 'design', state: 'approved', by: { kind: 'person', name: APPROVER } },
		])
		expect(reviewTextOf(lot.lotFolder)).not.toMatch(/DESIGN\.md|private reason|[0-9a-f]{64}/)
	})

	it('a waiver -> the design row reads waived by its waiver', () => {
		const lot = designLot({ declared: true })

		expect(
			design({ lot, words: ['--waive', '--by', APPROVER, '--reason', WAIVER_REASON] }).exitCode,
		).toBe(0)
		expect(reviewRowsOf(lot.lotFolder)).toEqual([
			{ schema: 1, kind: 'design', state: 'waived', by: { kind: 'person', name: APPROVER } },
		])
	})

	it('a design recorded and not approved -> the design row reads unapproved, nobody named', () => {
		const lot = designLot()

		expect(design({ lot, words: ['--from', lot.designFile] }).exitCode).toBe(0)
		expect(reviewRowsOf(lot.lotFolder)).toEqual([
			{ schema: 1, kind: 'design', state: 'unapproved' },
		])
	})

	it('an approval whose --by fails the public-word check (a line written by hand) -> the design row names nobody', () => {
		const lot = designLot()
		design({ lot, words: ['--from', lot.designFile] })
		const [recorded] = designLinesOf(lot) as { hash: string }[]
		appendFileSync(
			join(lot.lotFolder, STORE_FILES.design),
			`${JSON.stringify({ schema: 1, kind: 'approved', at: '2026-11-17T13:00:00.000Z', by: '/home/someone', hash: recorded.hash, need: [] })}\n`,
		)

		expect(design({ lot, words: [] }).exitCode).toBe(0)
		expect(refreshReviewRecord({ folder: lot.lotFolder })).toBeUndefined()
		expect(reviewRowsOf(lot.lotFolder)).toEqual([{ schema: 1, kind: 'design', state: 'approved' }])
	})
})
