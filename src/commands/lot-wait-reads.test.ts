/**
 * `lot wait` on a real lot reads its records only when something changed (R1-8): over polls where nothing changes
 * the transitions, the answers and the registry entry are read once, and read again after a change. Pinned through
 * the `onRead` seam of `waitLot`, which counts the reads of the wait loop.
 */
import { QUESTION_LOT } from '../../test/lot-questions.constants.ts'
import { createQuestionLot } from '../../test/lot-questions.ts'
import { createWaitTime } from '../../test/simulated-lot.ts'
import { questionTransitionOf, writeRecordFile } from '../../test/store-records.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { waitLot } from './lot-wait.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

describe('lot wait on a real lot: reads', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('three polls with nothing changing, then the timeout -> exit 5 and the records read once', async () => {
		const lot = createQuestionLot()
		const time = createWaitTime()
		let reads = 0

		await expect(
			waitLot({
				cwd: lot.workspace.repository,
				argv: [QUESTION_LOT, '--timeout', '3', '--json'],
				clock: time.clock,
				sleep: time.sleep,
				onRead: () => {
					reads += 1
				},
			}).then((result) => ({ exitCode: result.exitCode, sleeps: time.sleeps.length })),
		).resolves.toEqual({ exitCode: 5, sleeps: 3 })
		expect(reads).toBe(1)
	})

	it('a question published during the second sleep -> read again once, the wait returns input-required (exit 3)', async () => {
		const lot = createQuestionLot()
		let reads = 0
		const time = createWaitTime({
			onSleep: (call) => {
				if (call === 2)
					writeRecordFile({
						folder: lot.lotFolder,
						name: 'transitions/000002.json',
						text: `${JSON.stringify(questionTransitionOf({ seq: 2, number: 1 }))}\n`,
					})
			},
		})

		await expect(
			waitLot({
				cwd: lot.workspace.repository,
				argv: [QUESTION_LOT, '--timeout', '10', '--json'],
				clock: time.clock,
				sleep: time.sleep,
				onRead: () => {
					reads += 1
				},
			}).then((result) => result.exitCode),
		).resolves.toBe(3)
		expect(reads).toBe(2)
	})
})
