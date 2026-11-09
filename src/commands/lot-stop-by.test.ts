/**
 * `lot stop --by <who>` follows the answer's `--by` rule (decision of step 3): one line, not empty; an empty, blank
 * or multi-line `--by` exits 2 and writes nothing, however the lot stands.
 */
import { QUESTION_LOT } from '../../test/lot-questions.constants.ts'
import { createQuestionLot, transitionFilesOf } from '../../test/lot-questions.ts'
import { snapshotOf, withJson } from '../../test/lot-start-workspace.ts'
import { stopOf } from '../../test/lot-stop-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { QuestionLot } from '../../test/lot-questions.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** Everything the store holds for a hand-written lot: its folder and the registry, as text. */
function storeBytesOf(lot: QuestionLot): string {
	return JSON.stringify([snapshotOf(lot.lotFolder), snapshotOf(lot.workspace.registry)])
}

describe('lot stop --by', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const [title, by] of [
		['an empty --by', ''],
		['a blank --by', '   '],
		['a --by on two lines', 'a-person\nand someone'],
		['a --by with a lone carriage return', 'a-person\rsomeone'],
	] as const)
		it(`${title} -> exit 2 naming --by, nothing written`, () => {
			const lot = createQuestionLot()
			const before = storeBytesOf(lot)

			expect(stopOf({ cwd: lot.workspace.repository, id: QUESTION_LOT, by })).toMatchObject({
				exitCode: 2,
				output: expect.stringMatching(/--by/),
			})
			expect(storeBytesOf(lot)).toBe(before)
		})

	it('a bad --by under --json -> exit 2, JSON { error, next: null }, nothing written', () => {
		const lot = createQuestionLot()
		const before = storeBytesOf(lot)

		expect(
			withJson(stopOf({ cwd: lot.workspace.repository, id: QUESTION_LOT, by: '', json: true })),
		).toMatchObject({ exitCode: 2, json: { error: expect.stringMatching(/--by/), next: null } })
		expect(storeBytesOf(lot)).toBe(before)
	})

	it('a bad --by on a lot that is already canceled -> still exit 2: the rule holds before the lot is looked at', () => {
		const lot = createQuestionLot()
		expect(
			stopOf({ cwd: lot.workspace.repository, id: QUESTION_LOT, by: 'a-person' }).exitCode,
		).toBe(0)
		const before = storeBytesOf(lot)

		expect({
			second: stopOf({ cwd: lot.workspace.repository, id: QUESTION_LOT, by: '' }).exitCode,
			transitions: transitionFilesOf(lot.lotFolder).length,
			bytes: storeBytesOf(lot) === before,
		}).toEqual({ second: 2, transitions: 2, bytes: true })
	})
})
