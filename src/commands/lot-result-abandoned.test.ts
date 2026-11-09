/**
 * `lot result --json` of a lot canceled by its hand-over's abandon alone (R1-7): no `canceled` transition, only
 * `abandoned.json` or a registry entry `abandoned` -> exit 1, the reason `its hand-over was abandoned`, `at` the
 * marker's or the entry's time (not the last transition's).
 */
import { ABANDONED_MARKER_TIME } from '../../test/handover-store-scenario.constants.ts'
import { markAbandoned } from '../../test/handover-store-scenario.ts'
import { QUESTION_LOT } from '../../test/lot-questions.constants.ts'
import { createQuestionLot } from '../../test/lot-questions.ts'
import { withJson } from '../../test/lot-start-workspace.ts'
import { LATER_TIME } from '../../test/store-records.constants.ts'
import { entryOf, writeRecordFile } from '../../test/store-records.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { HANDOVER_FILES } from '../lib/handover/handover.constants.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { QuestionLot } from '../../test/lot-questions.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** `lot result <lot> --json` from the lot's repository. */
function resultJson(lot: QuestionLot) {
	return withJson(
		runLot({ cwd: lot.workspace.repository, argv: ['result', QUESTION_LOT, '--json'] }),
	)
}

describe(
	'lot result of a lot canceled by its abandoned hand-over',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('abandoned.json alone -> exit 1, canceled, reason its hand-over was abandoned, at the marker time', () => {
			const lot = createQuestionLot()
			markAbandoned({ folder: lot.lotFolder, file: HANDOVER_FILES.abandoned })

			expect(resultJson(lot)).toMatchObject({
				exitCode: 1,
				json: {
					state: 'canceled',
					reason: 'its hand-over was abandoned',
					at: ABANDONED_MARKER_TIME,
				},
			})
		})

		it('a registry entry abandoned alone -> exit 1, canceled, reason its hand-over was abandoned, at the entry time', () => {
			const lot = createQuestionLot()
			writeRecordFile({
				folder: lot.workspace.registry,
				name: `${QUESTION_LOT}.json`,
				text: JSON.stringify(
					entryOf({ state: 'abandoned', written: LATER_TIME, folder: lot.lotFolder }),
				),
			})

			expect(resultJson(lot)).toMatchObject({
				exitCode: 1,
				json: { state: 'canceled', reason: 'its hand-over was abandoned', at: LATER_TIME },
			})
		})
	},
)
