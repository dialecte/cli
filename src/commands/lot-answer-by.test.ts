/**
 * `lot answer --by <who>` follows the same rule as `lot stop --by`: one line, not empty; an empty, blank or
 * multi-line `--by` exits 2 (JSON `{ error, next: null }` under `--json`) and writes nothing, for a caller question
 * and for a person's.
 */
import {
	KEEP_OR_REPLACE,
	PERSON_ACCEPT_OR_FIX,
	QUESTION_LOT,
	QUESTION_NOW,
} from '../../test/lot-questions.constants.ts'
import { createQuestionLot } from '../../test/lot-questions.ts'
import { snapshotOf, withJson } from '../../test/lot-start-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { QuestionLot } from '../../test/lot-questions.types.ts'
import type { QuestionRecord } from '../lib/store/store.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** Everything the store holds for a hand-written lot: its folder and the registry, as text. */
function storeBytesOf(lot: QuestionLot): string {
	return JSON.stringify([snapshotOf(lot.lotFolder), snapshotOf(lot.workspace.registry)])
}

/** `lot answer` of q1 from the lot's repository with `--by <by>`, and `--json` when asked. */
function answerBy(params: { lot: QuestionLot; answer: string; by: string; json?: boolean }) {
	return runLot({
		cwd: params.lot.workspace.repository,
		argv: [
			'answer',
			QUESTION_LOT,
			'q1',
			params.answer,
			'--by',
			params.by,
			...(params.json ? ['--json'] : []),
		],
		now: QUESTION_NOW,
	})
}

const BAD_BY_VALUES = [
	['an empty --by', ''],
	['a blank --by', '   '],
	['a --by on two lines', 'a-person\nand someone'],
	['a --by with a lone carriage return', 'a-person\rsomeone'],
] as const

const QUESTIONS: [string, QuestionRecord, string][] = [
	['a caller question', KEEP_OR_REPLACE, 'keep'],
	['a person question', PERSON_ACCEPT_OR_FIX, 'accept'],
]

describe('lot answer --by', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const [kind, question, answer] of QUESTIONS)
		for (const [title, by] of BAD_BY_VALUES) {
			it(`${kind}, ${title} -> exit 2 naming --by, nothing written`, () => {
				const lot = createQuestionLot({ question })
				const before = storeBytesOf(lot)

				expect(answerBy({ lot, answer, by })).toMatchObject({
					exitCode: 2,
					output: expect.stringMatching(/--by/),
				})
				expect(storeBytesOf(lot)).toBe(before)
			})

			it(`${kind}, ${title}, with --json -> exit 2, JSON { error, next: null }, nothing written`, () => {
				const lot = createQuestionLot({ question })
				const before = storeBytesOf(lot)

				expect(withJson(answerBy({ lot, answer, by, json: true }))).toMatchObject({
					exitCode: 2,
					json: { error: expect.stringMatching(/--by/), next: null },
				})
				expect(storeBytesOf(lot)).toBe(before)
			})
		}
})
