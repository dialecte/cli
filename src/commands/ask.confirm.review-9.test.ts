/**
 * The user's answers (U17, U19): `ask answer` confirms an ask the outside readers answered, and `--verdict` keeps a
 * verdict on the person's fact so a re-ask whose readers agree supersedes it.
 */
import { join } from 'node:path'

import { ANSWER_TEXT, PERSON } from '../../test/ask-answer-fixtures.constants.ts'
import {
	askedPersonOnly,
	factIdsIn,
	packedOutsideInLot,
	personAnswered,
	readAnswerRecord,
	readFactIfAny,
} from '../../test/ask-answer-fixtures.ts'
import { readJsonFile } from '../../test/ask-command-workspace.ts'
import { workspaceFactsFolder } from '../../test/ask-fix-1-fixtures.ts'
import { ANSWER_LONG_TEXT } from '../../test/ask-verdict-fixtures.constants.ts'
import { outsideReportOf, reportFilesOf, verdictedWith } from '../../test/ask-verdict-fixtures.ts'
import { effortLineOf, writeRiskLines } from '../../test/risk-workspace.ts'
import { STANDARD_DISK_CASE_TIMEOUT, STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { readStandardLine } from '../lib/standard/read-standard-line.ts'

import { describe, expect, it } from 'vitest'

import type { PackedInLot } from '../../test/ask-answer-fixtures.types.ts'

/** An ask of a store lot the outside readers answered (two model readers agree): the fact F-0001, unchecked. */
async function outsideAnswered(): Promise<PackedInLot> {
	const packed = await packedOutsideInLot()
	const reports = [
		outsideReportOf({ packed, letter: 'A', answer: ANSWER_LONG_TEXT }),
		outsideReportOf({ packed, letter: 'B' }),
	]
	await verdictedWith({ packed, files: reportFilesOf({ packed, reports }), exitCode: 0 })
	return packed
}

describe('ask answer on an ask the outside readers answered: the person confirms it', () => {
	it(
		'the person answers -> exit 0, a person fact (by the person, still unchecked: no documents were read) that supersedes the outside fact, and the ask keeps a confirm.json naming it',
		async () => {
			const packed = await outsideAnswered()

			await personAnswered({ asked: packed, exitCode: 0 })

			const folder = workspaceFactsFolder({ workspace: packed.workspace })
			expect({
				facts: factIdsIn({ folder }),
				outside: readFactIfAny({ folder, id: 'F-0001' }),
				person: readFactIfAny({ folder, id: 'F-0002' }),
				confirm: readJsonFile(join(packed.asksFolder, packed.ask, 'confirm.json')),
			}).toMatchObject({
				facts: ['F-0001', 'F-0002'],
				outside: { supersededBy: 'F-0002' },
				person: {
					source: 'person',
					unchecked: true,
					answer: { text: ANSWER_TEXT },
					by: { person: PERSON },
				},
				confirm: {
					schema: 1,
					ask: packed.ask,
					fact: 'F-0002',
					by: PERSON,
					at: expect.stringMatching(/^\d{4}-/u),
				},
			})
		},
		STORE_CASE_TIMEOUT,
	)

	it(
		'a lot at effort high whose outside answer is unconfirmed fails the card; once the person has confirmed it, the note says confirmed and the card passes with a warning',
		async () => {
			const packed = await outsideAnswered()
			writeRiskLines({ folder: packed.lotFolder, lines: [effortLineOf({ effort: 'high' })] })
			const before = readStandardLine({ folder: packed.lotFolder }).status

			await personAnswered({ asked: packed, exitCode: 0 })

			expect({
				before,
				after: readStandardLine({ folder: packed.lotFolder }).status,
				note: readJsonFile(join(packed.lotFolder, 'standard.json')),
			}).toMatchObject({
				before: 'failed',
				after: 'warning',
				note: { state: 'outside', confirmed: true },
			})
		},
		STORE_CASE_TIMEOUT,
	)

	it(
		'a second confirmation -> exit 2 naming it already confirmed; nothing more recorded',
		async () => {
			const packed = await outsideAnswered()
			await personAnswered({ asked: packed, exitCode: 0 })

			const again = await personAnswered({ asked: packed, exitCode: 2 })

			expect({
				says: /confirmed/u.test(again.output),
				facts: factIdsIn({ folder: workspaceFactsFolder({ workspace: packed.workspace }) }),
			}).toEqual({ says: true, facts: ['F-0001', 'F-0002'] })
		},
		STORE_CASE_TIMEOUT,
	)
})

describe('ask answer --verdict: the person fact keeps a verdict', () => {
	it(
		'--verdict yes -> the person fact says yes, not person',
		async () => {
			const asked = await askedPersonOnly({ documents: true })

			await personAnswered({ asked, argv: ['--verdict', 'yes'], exitCode: 0 })

			expect(
				readFactIfAny({
					folder: workspaceFactsFolder({ workspace: asked.workspace }),
					id: 'F-0001',
				}),
			).toMatchObject({ source: 'person', answer: { verdict: 'yes', value: null } })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'--verdict value -> the person fact says value and holds the answer as its value',
		async () => {
			const asked = await askedPersonOnly({ documents: true })

			await personAnswered({ asked, argv: ['--verdict', 'value'], exitCode: 0 })

			expect(
				readFactIfAny({
					folder: workspaceFactsFolder({ workspace: asked.workspace }),
					id: 'F-0001',
				}),
			).toMatchObject({ answer: { verdict: 'value', value: ANSWER_TEXT } })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a verdict that is none of yes, no, depends, value -> exit 2 naming it and the four; nothing recorded',
		async () => {
			const asked = await askedPersonOnly({ documents: true })

			const answer = await personAnswered({ asked, argv: ['--verdict', 'maybe'], exitCode: 2 })

			expect({
				names: ['maybe', 'yes', 'no', 'depends', 'value'].map((word) =>
					answer.output.includes(word),
				),
				facts: factIdsIn({ folder: workspaceFactsFolder({ workspace: asked.workspace }) }),
				record: readAnswerRecord({ asked }),
			}).toEqual({ names: [true, true, true, true, true], facts: [], record: undefined })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})
