/**
 * A line feed inside agent text prints escaped, never as a line break (R3-1): a question text and a station holding
 * a line feed that forges a `next:` line, an escape sequence and an override -> the text form of `lot status`,
 * `lot wait`, `lot stop` and `lot answer` (each where it prints that field) prints as many lines as with a harmless
 * text, no raw unsafe character, and shows the line feed as `\u{a}`. The text form prints no note, no option and no
 * recorded answer outside the answer refusals (see lot-answer-escape.test.ts).
 */
import {
	HOSTILE_LINES_TEXT,
	QUESTION_LOT,
	QUESTION_NOW,
} from '../../test/lot-questions.constants.ts'
import { createQuestionLot, questionWith } from '../../test/lot-questions.ts'
import { stopOf } from '../../test/lot-stop-workspace.ts'
import { createWaitTime } from '../../test/simulated-lot.ts'
import { transitionOf } from '../../test/store-records.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { ESCAPED_SAFE_WITH_LINE_FEED } from '../../test/unsafe-characters.constants.ts'
import { escapeReportOf } from '../../test/unsafe-characters.ts'
import { waitLot } from './lot-wait.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { QuestionLot } from '../../test/lot-questions.types.ts'
import type { CommandResult } from '../lib/command-result.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const HARMLESS_TEXT = 'a harmless text'

/** A lot whose open questions q1 and q2 hold `text`. */
function lotWithQuestionText(text: string): QuestionLot {
	return createQuestionLot({
		question: questionWith({ text }),
		later: [
			transitionOf({
				seq: 3,
				kind: 'question',
				question: questionWith({ id: 'q2', text }),
			}),
		],
	})
}

/** A lot with q1 open and its last transition at the station `text`. */
function lotAtStation(text: string): QuestionLot {
	return createQuestionLot({
		question: questionWith(),
		later: [
			{
				...transitionOf({ seq: 3 }),
				position: { step: 1, of: 3, station: text, round: null },
			},
		],
	})
}

/**
 * A failed lot whose last transition is at the station `text`: no open question and no station line, so the status
 * text is short enough (state, position, checks, next) for the position line, which prints the station, to stay
 * within the five lines.
 */
function failedLotAtStation(text: string): QuestionLot {
	return createQuestionLot({
		later: [
			{
				...transitionOf({ seq: 2, state: 'failed', kind: 'fail' }),
				position: { step: 1, of: 3, station: text, round: null },
			},
		],
	})
}

/** The verbs, each run on a lot from its repository. */
const VERBS = {
	status(lot: QuestionLot): Promise<CommandResult> {
		return Promise.resolve(
			runLot({ cwd: lot.workspace.repository, argv: ['status', QUESTION_LOT] }),
		)
	},
	wait(lot: QuestionLot): Promise<CommandResult> {
		const time = createWaitTime()
		return waitLot({
			cwd: lot.workspace.repository,
			argv: [QUESTION_LOT],
			clock: time.clock,
			sleep: time.sleep,
		})
	},
	stop(lot: QuestionLot): Promise<CommandResult> {
		return Promise.resolve(stopOf({ cwd: lot.workspace.repository, id: QUESTION_LOT }))
	},
	answer(lot: QuestionLot): Promise<CommandResult> {
		return Promise.resolve(
			runLot({
				cwd: lot.workspace.repository,
				argv: ['answer', QUESTION_LOT, 'q1', 'keep'],
				now: QUESTION_NOW,
			}),
		)
	},
}

/** Each field, the lot holding a text in it, and the verbs that print it (a stopped lot has no open question to print). */
const CASES = [
	...(['status', 'wait', 'answer'] as const).map((verb) => ({
		field: 'a question text',
		lotWith: lotWithQuestionText,
		verb,
	})),
	// the lot's text form prints the position line only while five lines are enough: a working lot with an open
	// question also prints the station line, so status and wait read a failed lot, which prints fewer lines
	...(['status', 'wait'] as const).map((verb) => ({
		field: 'a station',
		lotWith: failedLotAtStation,
		verb,
	})),
	...(['stop', 'answer'] as const).map((verb) => ({
		field: 'a station',
		lotWith: lotAtStation,
		verb,
	})),
]

describe('a line feed in agent text prints escaped', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const { field, lotWith, verb } of CASES)
		it(`lot ${verb}, ${field} holding a line feed -> no forged line, no raw byte, shown as \\u{a}`, async () => {
			const harmless = await VERBS[verb](lotWith(HARMLESS_TEXT))
			const hostile = await VERBS[verb](lotWith(HOSTILE_LINES_TEXT))

			expect({
				exitCode: hostile.exitCode,
				...escapeReportOf({ result: hostile, lines: harmless.output.split('\n').length }),
			}).toEqual({ exitCode: harmless.exitCode, ...ESCAPED_SAFE_WITH_LINE_FEED })
		})
})
