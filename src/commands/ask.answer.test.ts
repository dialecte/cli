import {
	ABSENT_QUOTE,
	ANSWER_TEXT,
	CITED_FILE,
	CLAUSE_LINES,
	CLAUSE_SENTENCES,
	ISO_TIME_PATTERN,
	PERSON,
} from '../../test/ask-answer-fixtures.constants.ts'
import {
	askedAnsweredAtRungOne,
	askedOverClausesInRounds,
	askedPersonOnly,
	citeArgvOf,
	factIdsIn,
	otherClauseOf,
	personAnswered,
	personAnsweredJson,
	readAnswerRecord,
} from '../../test/ask-answer-fixtures.ts'
import { SEMANTIC_QUESTION } from '../../test/ask-command-workspace.constants.ts'
import { workspaceFactsFolder } from '../../test/ask-fix-1-fixtures.ts'
import { askedForPack, askedOutside, packedWith } from '../../test/ask-pack-fixtures.ts'
import { factFolderText, readFactFile } from '../../test/fact-fixtures.ts'
import { STANDARD_DISK_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'

import { describe, expect, it } from 'vitest'

import type { AskedForPack } from '../../test/ask-pack-fixtures.types.ts'

/** The ledger folder of the ask's workspace. */
function ledgerOf(asked: AskedForPack): string {
	return workspaceFactsFolder({ workspace: asked.workspace })
}

describe('ask answer: the person answers an ask and the answer is recorded as a person fact (behaviour 1)', () => {
	it(
		'an ask on the documents that readers could not answer -> exit 0, a person fact by the person holding the text, checked (not unchecked), for the ask question',
		async () => {
			const asked = await askedForPack()

			await personAnswered({ asked, exitCode: 0 })

			const fact = readFactFile({ folder: ledgerOf(asked), id: 'F-0001' })
			expect(fact).toMatchObject({
				source: 'person',
				state: 'valid',
				question: SEMANTIC_QUESTION,
				answer: { text: ANSWER_TEXT },
				by: { rung: 6, person: PERSON },
			})
			expect(fact).not.toHaveProperty('unchecked')
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'an ask that went outside (no documents for the standard) -> the person fact carries unchecked: true (32e)',
		async () => {
			const asked = await askedOutside()

			await personAnswered({ asked, exitCode: 0 })

			expect(readFactFile({ folder: ledgerOf(asked), id: 'F-0001' })).toMatchObject({
				source: 'person',
				unchecked: true,
				by: { person: PERSON },
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'an ask sent to the person with --person-only while documents are configured -> the person fact carries unchecked: true (32e)',
		async () => {
			const asked = await askedPersonOnly({ documents: true })

			await personAnswered({ asked, exitCode: 0 })

			expect(readFactFile({ folder: ledgerOf(asked), id: 'F-0001' })).toMatchObject({
				source: 'person',
				unchecked: true,
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'the answer is kept in the ask folder: answer.json holds the ask, the person, the text, the fact and no cite',
		async () => {
			const asked = await askedForPack()

			await personAnswered({ asked, exitCode: 0 })

			expect(readAnswerRecord({ asked })).toEqual({
				schema: 1,
				ask: asked.ask,
				by: PERSON,
				text: ANSWER_TEXT,
				cite: null,
				citeRefused: null,
				miss: null,
				fact: 'F-0001',
				at: expect.stringMatching(ISO_TIME_PATTERN),
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'--json prints schema 1: the ask, the fact, no miss and no refused cite',
		async () => {
			const asked = await askedForPack()

			const json = await personAnsweredJson({ asked, exitCode: 0 })

			expect(json).toEqual({
				schema: 1,
				ask: asked.ask,
				fact: 'F-0001',
				miss: null,
				citeRefused: null,
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'the ask is answered afterwards: a pack asked for it is refused, naming it answered (D6: the latest record wins)',
		async () => {
			const asked = await askedForPack()
			await personAnswered({ asked, exitCode: 0 })

			const pack = await packedWith({ workspace: asked.workspace, argv: [asked.ask], exitCode: 2 })

			expect(pack.output).toContain(`ask ${asked.ask} is answered`)
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'an ask already answered -> exit 2 naming it answered; the fact is left as it was and no answer.json is written',
		async () => {
			const asked = await askedAnsweredAtRungOne()
			const before = factFolderText({ folder: ledgerOf(asked), name: 'F-0001.json' })

			const answer = await personAnswered({ asked, exitCode: 2 })

			expect({
				output: answer.output,
				fact: factFolderText({ folder: ledgerOf(asked), name: 'F-0001.json' }),
				facts: factIdsIn({ folder: ledgerOf(asked) }),
				answer: readAnswerRecord({ asked }),
			}).toEqual({
				output: expect.stringContaining(`ask ${asked.ask} is answered`),
				fact: before,
				facts: ['F-0001'],
				answer: undefined,
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('ask answer: what it refuses, exit 2, nothing recorded', () => {
	it(
		'no --by -> exit 2 naming --by; no fact and no answer.json',
		async () => {
			const asked = await askedForPack()

			const answer = await personAnswered({ asked, by: null, exitCode: 2 })

			expect({
				output: answer.output,
				facts: factIdsIn({ folder: ledgerOf(asked) }),
				answer: readAnswerRecord({ asked }),
			}).toEqual({ output: expect.stringContaining('--by'), facts: [], answer: undefined })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'--cite without --quote -> exit 2 naming --quote; no fact and no answer.json',
		async () => {
			const asked = await askedForPack()

			const answer = await personAnswered({
				asked,
				argv: ['--cite', `${CITED_FILE}:${CLAUSE_LINES.first}-${CLAUSE_LINES.first}`],
				exitCode: 2,
			})

			expect({
				output: answer.output,
				facts: factIdsIn({ folder: ledgerOf(asked) }),
				answer: readAnswerRecord({ asked }),
			}).toEqual({ output: expect.stringContaining('--quote'), facts: [], answer: undefined })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('ask answer --cite: the cite is checked as a reader cite and recorded as a reader miss or not (32c)', () => {
	it(
		'a cite inside a slice given in the second round -> the answer is recorded and the miss says given, in the second round',
		async () => {
			const { asked, roundOneClause } = await askedOverClausesInRounds({ packRoundTwo: true })
			const clause = otherClauseOf({ clause: roundOneClause })

			const json = await personAnsweredJson({ asked, argv: citeArgvOf({ clause }), exitCode: 0 })

			expect(json).toEqual({
				schema: 1,
				ask: asked.ask,
				fact: 'F-0001',
				miss: { given: true, round: 2 },
				citeRefused: null,
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a cite inside a slice given in the first round -> the miss says given, in the first round',
		async () => {
			const { asked, roundOneClause } = await askedOverClausesInRounds({ packRoundTwo: true })

			const json = await personAnsweredJson({
				asked,
				argv: citeArgvOf({ clause: roundOneClause }),
				exitCode: 0,
			})

			expect(json.miss).toEqual({ given: true, round: 1 })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a cite outside every slice given (the other slice was never packed) -> the answer is recorded and the miss says not given, no round',
		async () => {
			const { asked, roundOneClause } = await askedOverClausesInRounds({ packRoundTwo: false })
			const clause = otherClauseOf({ clause: roundOneClause })

			const json = await personAnsweredJson({ asked, argv: citeArgvOf({ clause }), exitCode: 0 })

			expect(json).toEqual({
				schema: 1,
				ask: asked.ask,
				fact: 'F-0001',
				miss: { given: false, round: null },
				citeRefused: null,
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'the cite is kept in answer.json whole: the file, the lines and the quote, with the miss',
		async () => {
			const { asked, roundOneClause } = await askedOverClausesInRounds({ packRoundTwo: true })
			const clause = otherClauseOf({ clause: roundOneClause })

			await personAnswered({ asked, argv: citeArgvOf({ clause }), exitCode: 0 })

			expect(readAnswerRecord({ asked })).toMatchObject({
				cite: {
					file: CITED_FILE,
					from: CLAUSE_LINES[clause],
					to: CLAUSE_LINES[clause],
					quote: CLAUSE_SENTENCES[clause],
				},
				citeRefused: null,
				miss: { given: true, round: 2 },
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a cite whose quote is not in its range (refused by the cite check) -> the answer is recorded, no miss, the refusal named',
		async () => {
			const { asked, roundOneClause } = await askedOverClausesInRounds({ packRoundTwo: true })

			const json = await personAnsweredJson({
				asked,
				argv: citeArgvOf({ clause: roundOneClause, quote: ABSENT_QUOTE }),
				exitCode: 0,
			})

			expect(json).toEqual({
				schema: 1,
				ask: asked.ask,
				fact: 'F-0001',
				miss: null,
				citeRefused: 'quote-not-found',
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a cite refused by the cite check -> the person fact is still recorded, and answer.json keeps the refusal',
		async () => {
			const { asked, roundOneClause } = await askedOverClausesInRounds({ packRoundTwo: true })

			await personAnswered({
				asked,
				argv: citeArgvOf({ clause: roundOneClause, quote: ABSENT_QUOTE }),
				exitCode: 0,
			})

			expect({
				facts: factIdsIn({ folder: ledgerOf(asked) }),
				record: readAnswerRecord({ asked }),
			}).toMatchObject({
				facts: ['F-0001'],
				record: { citeRefused: 'quote-not-found', miss: null },
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})
