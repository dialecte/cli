import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { CITED_FILE } from '../../test/ask-answer-fixtures.constants.ts'
/**
 * Independent re-verification of `ask` and `ask verdict`: the next command of the ask itself in a lot (J-1), the
 * question raised once and after the round closes (J-2), every issued letter declared missing (J-5), the hand-off
 * naming angles by terms and slices by file and lines (J-8).
 */
import { ROUND_CLAIM_FILE } from '../../test/ask-answer-fixtures.constants.ts'
import { askedInLot, raisedQuestionsOf, writeClaimFile } from '../../test/ask-answer-fixtures.ts'
import { SEMANTIC_QUESTION } from '../../test/ask-command-workspace.constants.ts'
import {
	askedJson,
	createLotAskWorkspace,
	readEventsFile,
	readJsonFile,
} from '../../test/ask-command-workspace.ts'
import {
	HAND_WRITTEN_AT,
	ROUND_ONE,
	ROUND_TWO,
	VERDICT_FILE,
} from '../../test/ask-pack-fixtures.constants.ts'
import { packedWith, roundFolderOf, writeRoundOne } from '../../test/ask-pack-fixtures.ts'
import { FIRST_QUESTION, FORCED_CRASH } from '../../test/ask-review-1-fixtures.constants.ts'
import { packedInLot, partialRoundOne } from '../../test/ask-review-1-fixtures.ts'
import { ANSWER_LONG_TEXT } from '../../test/ask-verdict-fixtures.constants.ts'
import {
	agreeingReportsOf,
	packedForAdjudicator,
	packedForVerdict,
	reportFilesOf,
	reportOf,
	verdictedJson,
	verdictedWith,
} from '../../test/ask-verdict-fixtures.ts'
import { LOT_NAME } from '../../test/lot-stores.constants.ts'
import { writeTextFile } from '../../test/standard-workspace.ts'
import { STANDARD_DISK_CASE_TIMEOUT, STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { askStateOf } from '../lib/knowledge/ask/ask-state-of.ts'
import { runAskVerdict } from './ask-verdict.ts'

import { describe, expect, it } from 'vitest'

import type { PackedForVerdict } from '../../test/ask-verdict-fixtures.types.ts'
import type { VerdictRecord } from '../lib/knowledge/ask/ask.types.ts'

/** Round 1 of the ask closed at the person by hand: its `verdict.json` written, no question raised. */
function writeClosedAtPerson(params: { packed: PackedForVerdict }): void {
	const { packed } = params
	const closed: VerdictRecord = {
		schema: 1,
		ask: packed.ask,
		round: 1,
		adjudicator: false,
		reports: [],
		outcome: { state: 'needs-person', reason: 'no-agreement' },
		verifiedAngles: [],
		state: 'needs-person',
		next: null,
		fact: null,
		at: HAND_WRITTEN_AT,
	}
	writeTextFile({
		path: join(roundFolderOf({ asked: packed, round: ROUND_ONE }), VERDICT_FILE),
		text: `${JSON.stringify(closed, null, '\t')}\n`,
	})
}

describe('ask: the next command of a person in a store lot is the lot answer', () => {
	it(
		'an ask sent to the person with --person-only in a store lot -> next is dialecte lot answer <lot> <question>; outside a lot it stays ask answer (pinned elsewhere)',
		async () => {
			const { workspace, lotFolder } = createLotAskWorkspace({ place: 'project' })

			const json = await askedJson({
				workspace,
				argv: [SEMANTIC_QUESTION, '--person-only', '--lot', lotFolder],
				exitCode: 1,
			})

			expect(json.next).toBe(`dialecte lot answer ${LOT_NAME} ${FIRST_QUESTION}`)
		},
		STORE_CASE_TIMEOUT,
	)
})

describe('ask verdict: the question of the person is raised once, after the round is closed', () => {
	it(
		'a crash right after the question is raised, then the same verdict again -> exactly one question is open for the ask',
		async () => {
			const packed = await packedInLot()
			const files = reportFilesOf({
				packed,
				reports: [
					reportOf({ packed, letter: 'A', clause: 'first', answer: ANSWER_LONG_TEXT }),
					reportOf({ packed, letter: 'B', clause: 'second' }),
				],
			})
			const params = {
				argv: [packed.ask, ...files, '--json', ...packed.lotArgv],
				cwd: packed.workspace.cwd,
				environment: packed.workspace.environment,
			}

			await expect(
				runAskVerdict({
					...params,
					afterRaise: function crash() {
						throw new Error(FORCED_CRASH)
					},
				}),
			).rejects.toThrow(FORCED_CRASH)
			await runAskVerdict(params)

			expect(raisedQuestionsOf({ lotFolder: packed.lotFolder })).toHaveLength(1)
		},
		STORE_CASE_TIMEOUT,
	)
})

describe('ask verdict: a round closed at the person whose question was never raised', () => {
	it(
		'a crash between verdict.json and the raise (the closed round written by hand, no question in the lot) -> a re-run raises exactly one question and refuses the closed round naming the lot answer; a second re-run raises nothing more',
		async () => {
			const packed = await packedInLot()
			writeClosedAtPerson({ packed })
			const files = reportFilesOf({ packed, reports: agreeingReportsOf({ packed }) })

			const first = await verdictedWith({ packed, files, exitCode: 2 })
			const afterFirst = raisedQuestionsOf({ lotFolder: packed.lotFolder }).length
			await verdictedWith({ packed, files, exitCode: 2 })

			expect({
				namesLotAnswer: first.output.includes(`dialecte lot answer ${LOT_NAME} ${FIRST_QUESTION}`),
				afterFirst,
				afterSecond: raisedQuestionsOf({ lotFolder: packed.lotFolder }).length,
				questions: raisedQuestionsOf({ lotFolder: packed.lotFolder }),
			}).toMatchObject({
				namesLotAnswer: true,
				afterFirst: 1,
				afterSecond: 1,
				questions: [{ audience: 'person', ask: packed.ask }],
			})
		},
		STORE_CASE_TIMEOUT,
	)
})

describe('ask verdict: the question raised again for a closed round takes the round claim and the pointer text', () => {
	it(
		'the round claim held by a live process -> the re-run is refused as in progress and raises no question',
		async () => {
			const packed = await packedInLot()
			writeClosedAtPerson({ packed })
			writeClaimFile({
				path: join(roundFolderOf({ asked: packed, round: ROUND_ONE }), ROUND_CLAIM_FILE),
				pid: process.pid,
				ageMs: 0,
			})
			const files = reportFilesOf({ packed, reports: agreeingReportsOf({ packed }) })

			const run = await verdictedWith({ packed, files, exitCode: 2 })

			expect({
				inProgress: /in progress/u.test(run.output),
				questions: raisedQuestionsOf({ lotFolder: packed.lotFolder }).length,
			}).toEqual({ inProgress: true, questions: 0 })
		},
		STORE_CASE_TIMEOUT,
	)
})

describe('ask pack: a round skipped for nothing left goes through the person route', () => {
	it(
		'a documents ask of a store lot whose first round gave every slice and asked for another -> the pack records needs-person (an ask.state event), raises the question and names the lot answer',
		async () => {
			const asked = await askedInLot({ documents: true, exitCode: 3 })
			const ids = (
				readJsonFile(join(asked.asksFolder, asked.ask, 'ask.json')) as { slices: { id: string }[] }
			).slices.map((slice) => slice.id)
			writeRoundOne({ asked: { ...asked, sliceIds: ids }, given: 'all' })

			const answer = await packedWith({
				workspace: asked.workspace,
				argv: [asked.ask, '--json', ...asked.lotArgv],
				exitCode: 1,
			})

			expect({
				next: (JSON.parse(answer.output) as { next: string }).next,
				states: readEventsFile(join(asked.lotFolder, 'events.jsonl'))
					.filter((event) => event.kind === 'ask.state')
					.map((event) => event.state),
				questions: raisedQuestionsOf({ lotFolder: asked.lotFolder }).length,
			}).toMatchObject({
				next: `dialecte lot answer ${LOT_NAME} ${FIRST_QUESTION}`,
				states: expect.arrayContaining(['needs-person']),
				questions: 1,
			})
		},
		STORE_CASE_TIMEOUT,
	)

	it(
		'the same skipped pack -> the round keeps a skipped.json (schema 1, ask, round, needs-person, reason, time), the ask reads needs-person and the lot note lists it; a second pack raises nothing and rewrites nothing',
		async () => {
			const asked = await askedInLot({ documents: true, exitCode: 3 })
			const ids = (
				readJsonFile(join(asked.asksFolder, asked.ask, 'ask.json')) as { slices: { id: string }[] }
			).slices.map((slice) => slice.id)
			writeRoundOne({ asked: { ...asked, sliceIds: ids }, given: 'all' })
			const argv = [asked.ask, '--json', ...asked.lotArgv]
			const record = join(roundFolderOf({ asked, round: ROUND_TWO }), 'skipped.json')

			await packedWith({ workspace: asked.workspace, argv, exitCode: 1 })
			const first = existsSync(record) ? readFileSync(record, 'utf8') : undefined
			await packedWith({ workspace: asked.workspace, argv, exitCode: 1 })

			expect({
				record: first === undefined ? undefined : JSON.parse(first),
				again: existsSync(record) ? readFileSync(record, 'utf8') : undefined,
				state: askStateOf({ askFolder: join(asked.asksFolder, asked.ask) }).state,
				note: (readJsonFile(join(asked.lotFolder, 'standard.json')) as { note: string }).note,
				questions: raisedQuestionsOf({ lotFolder: asked.lotFolder }).length,
			}).toMatchObject({
				record: {
					schema: 1,
					ask: asked.ask,
					round: 2,
					state: 'needs-person',
					reason: expect.stringMatching(/\S/u),
					at: expect.stringMatching(/^\d{4}-/u),
				},
				again: first,
				state: 'needs-person',
				note: expect.stringContaining(`${asked.ask} needs-person`),
				questions: 1,
			})
		},
		STORE_CASE_TIMEOUT,
	)
})

describe('ask verdict --missing: every issued letter declared missing needs no report file', () => {
	it(
		'a first round that gave one slice of two, both readers declared missing -> exit 3, another round, both recorded refused missing',
		async () => {
			const { packed } = await partialRoundOne()

			const json = await verdictedJson({
				packed,
				files: [],
				argv: ['--missing', 'A', '--missing', 'B'],
				exitCode: 3,
			})

			expect({ state: json.state, reports: json.reports }).toMatchObject({
				state: 'needs-readers',
				reports: [
					{ letter: 'A', accepted: false, refused: 'missing' },
					{ letter: 'B', accepted: false, refused: 'missing' },
				],
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'both readers given every slice, both declared missing -> exit 1, the person (nothing is left to give)',
		async () => {
			const packed = await packedForVerdict()

			const json = await verdictedJson({
				packed,
				files: [],
				argv: ['--missing', 'A', '--missing', 'B'],
				exitCode: 1,
			})

			expect(json.state).toBe('needs-person')
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'the adjudicator declared missing -> exit 1, the person',
		async () => {
			const { packed } = await packedForAdjudicator()

			const json = await verdictedJson({
				packed,
				files: [],
				argv: ['--adjudicator', '--missing', 'adjudicator'],
				exitCode: 1,
			})

			expect(json.state).toBe('needs-person')
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('ask verdict: the hand-off names angles by their terms and slices by file and lines', () => {
	it(
		'readers that disagree, handed to the person -> the printed hand-off names the angle term AA_1 and a slice as <file>:<from>-<to>',
		async () => {
			const packed = await packedForVerdict({ argv: ['--effort', 'low'] })
			const files = reportFilesOf({
				packed,
				reports: [
					reportOf({ packed, letter: 'A', clause: 'first', answer: ANSWER_LONG_TEXT }),
					reportOf({ packed, letter: 'B', clause: 'second' }),
				],
			})

			const answer = await verdictedWith({ packed, files, exitCode: 1 })

			expect({
				anglesByTerm: /angles searched: .*AA_1/u.test(answer.output),
				slicesByLines: new RegExp(`read: ${CITED_FILE}:\\d+-\\d+`, 'u').test(answer.output),
			}).toEqual({ anglesByTerm: true, slicesByLines: true })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})
