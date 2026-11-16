/**
 * Review round 1, R1-16: `ask pack` writes an `ask.pack` event (the round, how many readers, whether the pack was
 * skipped) and `ask answer` an `ask.answer` event (rung 6, the reader miss, the cite refusal); neither holds the
 * question, an answer, a quote or a url.
 */
import {
	ABSENT_QUOTE,
	ANSWER_TEXT,
	CLAUSE_SENTENCES,
} from '../../test/ask-answer-fixtures.constants.ts'
import {
	askedOverClausesInRounds,
	citeArgvOf,
	otherClauseOf,
	personAnsweredJson,
} from '../../test/ask-answer-fixtures.ts'
import { PRIVATE_WORD, SEMANTIC_QUESTION } from '../../test/ask-command-workspace.constants.ts'
import { eventsPathIn, readEventsFile } from '../../test/ask-command-workspace.ts'
import { askedForPack, packedWith, writeRoundOne } from '../../test/ask-pack-fixtures.ts'
import { packedForVerdict } from '../../test/ask-verdict-fixtures.ts'
import { STANDARD_DISK_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'

import { describe, expect, it } from 'vitest'

import type { ReadEvent } from '../../test/ask-command-workspace.types.ts'

/** The events of one kind in the asks folder's events file. */
function eventsOfKind(params: { asksFolder: string; kind: string }): ReadEvent[] {
	return readEventsFile(eventsPathIn(params.asksFolder)).filter(
		(event) => event.kind === params.kind,
	)
}

describe('ask pack writes an ask.pack event', () => {
	it(
		'a pack that opens the first round for two readers -> one ask.pack event: the ask, round one, 2 readers, not skipped',
		async () => {
			const packed = await packedForVerdict()

			expect(eventsOfKind({ asksFolder: packed.asksFolder, kind: 'ask.pack' })).toMatchObject([
				{ ask: packed.ask, round: 1, readers: 2, skipped: false },
			])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a pack with nothing new to give -> one ask.pack event: the second round, no reader, skipped',
		async () => {
			const asked = await askedForPack()
			writeRoundOne({ asked, given: 'all' })

			await packedWith({ workspace: asked.workspace, argv: [asked.ask], exitCode: 1 })

			expect(eventsOfKind({ asksFolder: asked.asksFolder, kind: 'ask.pack' })).toMatchObject([
				{ ask: asked.ask, round: 2, readers: 0, skipped: true },
			])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'the ask.pack event holds no question, no word of it and no url',
		async () => {
			const packed = await packedForVerdict()

			const text = JSON.stringify(eventsOfKind({ asksFolder: packed.asksFolder, kind: 'ask.pack' }))

			expect({
				kept: text.length > 0 && text.includes('ask.pack'),
				holdsQuestion: text.includes(SEMANTIC_QUESTION),
				holdsWord: text.includes(PRIVATE_WORD),
				holdsUrl: text.includes('http'),
			}).toEqual({ kept: true, holdsQuestion: false, holdsWord: false, holdsUrl: false })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('ask answer writes an ask.answer event', () => {
	it(
		'an answer with a cite inside a slice given in the second round -> one ask.answer event: rung 6, the miss given in the second round, no refusal',
		async () => {
			const { asked, roundOneClause } = await askedOverClausesInRounds({ packRoundTwo: true })
			const clause = otherClauseOf({ clause: roundOneClause })

			await personAnsweredJson({ asked, argv: citeArgvOf({ clause }), exitCode: 0 })

			expect(eventsOfKind({ asksFolder: asked.asksFolder, kind: 'ask.answer' })).toMatchObject([
				{ ask: asked.ask, rung: 6, miss: { given: true, round: 2 }, citeRefused: null },
			])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'an answer whose cite is refused -> one ask.answer event: no miss, the refusal named',
		async () => {
			const { asked, roundOneClause } = await askedOverClausesInRounds({ packRoundTwo: true })

			await personAnsweredJson({
				asked,
				argv: citeArgvOf({ clause: roundOneClause, quote: ABSENT_QUOTE }),
				exitCode: 0,
			})

			expect(eventsOfKind({ asksFolder: asked.asksFolder, kind: 'ask.answer' })).toMatchObject([
				{ ask: asked.ask, rung: 6, miss: null, citeRefused: 'quote-not-found' },
			])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'an answer with no cite -> one ask.answer event: no miss, no refusal',
		async () => {
			const { asked } = await askedOverClausesInRounds({ packRoundTwo: false })

			await personAnsweredJson({ asked, exitCode: 0 })

			expect(eventsOfKind({ asksFolder: asked.asksFolder, kind: 'ask.answer' })).toMatchObject([
				{ ask: asked.ask, rung: 6, miss: null, citeRefused: null },
			])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'the ask.answer event holds no question, answer text, quote or url',
		async () => {
			const { asked, roundOneClause } = await askedOverClausesInRounds({ packRoundTwo: true })
			const clause = otherClauseOf({ clause: roundOneClause })

			await personAnsweredJson({ asked, argv: citeArgvOf({ clause }), exitCode: 0 })

			const text = JSON.stringify(
				eventsOfKind({ asksFolder: asked.asksFolder, kind: 'ask.answer' }),
			)
			expect({
				kept: text.includes('ask.answer'),
				holdsQuestion: text.includes(SEMANTIC_QUESTION),
				holdsAnswer: text.includes(ANSWER_TEXT),
				holdsQuote: text.includes(CLAUSE_SENTENCES[clause]),
				holdsUrl: text.includes('http'),
			}).toEqual({
				kept: true,
				holdsQuestion: false,
				holdsAnswer: false,
				holdsQuote: false,
				holdsUrl: false,
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})
