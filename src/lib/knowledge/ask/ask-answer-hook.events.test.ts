/**
 * The answer hook of `lot answer` writes an `ask.answer` event as `ask answer` does: the ask, rung 6, no miss and no
 * cite refusal (the hook takes no cite), never a text.
 */
import { join } from 'node:path'

import { LOT_ANSWER_TEXT, PERSON } from '../../../../test/ask-answer-fixtures.constants.ts'
import { askedInLot, pointProcessAt } from '../../../../test/ask-answer-fixtures.ts'
import { SEMANTIC_QUESTION } from '../../../../test/ask-command-workspace.constants.ts'
import { readEventsFile } from '../../../../test/ask-command-workspace.ts'
import { hookInputOf } from '../../../../test/ask-review-1-fixtures.ts'
import { STORE_CASE_TIMEOUT } from '../../../../test/test-timing.constants.ts'
import { askAnswerHook } from './ask-answer-hook.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

describe('the answer hook: its ask.answer event', () => {
	it(
		'a person answers the question of an ask of a lot -> one ask.answer event in the lot events: the ask, rung 6, no miss, no refusal, and no text',
		async () => {
			const asked = await askedInLot({ documents: false, exitCode: 3 })
			pointProcessAt({ workspace: asked.workspace })

			askAnswerHook(hookInputOf({ asked, text: LOT_ANSWER_TEXT, by: PERSON }))

			const events = readEventsFile(join(asked.lotFolder, 'events.jsonl')).filter(
				(event) => event.kind === 'ask.answer',
			)
			expect({
				events,
				holdsText: [LOT_ANSWER_TEXT, SEMANTIC_QUESTION].map((text) =>
					JSON.stringify(events).includes(text),
				),
			}).toMatchObject({
				events: [{ ask: asked.ask, rung: 6, miss: null, citeRefused: null }],
				holdsText: [false, false],
			})
		},
		STORE_CASE_TIMEOUT,
	)
})
