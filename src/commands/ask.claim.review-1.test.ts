/**
 * Review round 1, R1-6 (D43 2): one claim on the ask (`ask.claim`, the process id) is taken by `ask verdict` and
 * `ask answer` before any fact, so an answer and a verdict never both record; a retry after a crash between the fact
 * and `answer.json` records no second fact.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { A_YEAR_MS, ANSWER_TEXT, PERSON } from '../../test/ask-answer-fixtures.constants.ts'
import {
	askedPersonOnly,
	deadProcessId,
	factIdsIn,
	personAnsweredJson,
	readAnswerRecord,
	writeClaimFile,
} from '../../test/ask-answer-fixtures.ts'
import { workspaceFactsFolder } from '../../test/ask-fix-1-fixtures.ts'
import { ROUND_ONE } from '../../test/ask-pack-fixtures.constants.ts'
import { roundFolderOf } from '../../test/ask-pack-fixtures.ts'
import {
	ASK_CLAIM_FILE,
	EARLIER_PERSON_DRAFT,
	FORCED_CRASH,
	IN_PROGRESS_WORDS,
} from '../../test/ask-review-1-fixtures.constants.ts'
import { recordFactOfAsk } from '../../test/ask-review-1-fixtures.ts'
import { FIRST_FACT } from '../../test/ask-verdict-fixtures.constants.ts'
import {
	agreeingReportsOf,
	packedForVerdict,
	reportFilesOf,
} from '../../test/ask-verdict-fixtures.ts'
import { readHistoryFile } from '../../test/fact-fixtures.ts'
import { STANDARD_DISK_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runAskAnswer } from './ask-answer.ts'
import { runAskVerdict } from './ask-verdict.ts'

import { describe, expect, it } from 'vitest'

import type { AskedForPack } from '../../test/ask-pack-fixtures.types.ts'
import type { PackedForVerdict } from '../../test/ask-verdict-fixtures.types.ts'
import type { CommandOutput } from '../lib/command-output.types.ts'

/** The command line, folder and environment of `ask answer` in the ask's workspace. */
function answerParamsOf(params: { asked: AskedForPack }): {
	argv: string[]
	cwd: string
	environment: NodeJS.ProcessEnv
} {
	const { asked } = params
	return {
		argv: [asked.ask, ANSWER_TEXT, '--by', PERSON, '--json'],
		cwd: asked.workspace.cwd,
		environment: asked.workspace.environment,
	}
}

/** The command line, folder and environment of `ask verdict` over the files in the ask's workspace. */
function verdictParamsOf(params: { packed: PackedForVerdict; files: string[] }): {
	argv: string[]
	cwd: string
	environment: NodeJS.ProcessEnv
} {
	const { packed } = params
	return {
		argv: [packed.ask, ...params.files, '--json'],
		cwd: packed.workspace.cwd,
		environment: packed.workspace.environment,
	}
}

/** Where the ask's own claim lives. */
function askClaimOf(params: { asked: AskedForPack }): string {
	return join(params.asked.asksFolder, params.asked.ask, ASK_CLAIM_FILE)
}

describe('ask answer and ask verdict on one ask never both record', () => {
	it(
		'a person answers while a verdict run holds the ask -> the answer is refused (exit 2, in progress); the verdict closes the round: one fact, no answer.json',
		async () => {
			const packed = await packedForVerdict()
			const files = reportFilesOf({ packed, reports: agreeingReportsOf({ packed }) })
			const seen: { answer: CommandOutput | undefined } = { answer: undefined }

			const verdict = await runAskVerdict({
				...verdictParamsOf({ packed, files }),
				afterFact: async function personAnswersMeanwhile() {
					seen.answer = await runAskAnswer(answerParamsOf({ asked: packed }))
				},
			})

			expect({
				verdict: verdict.exitCode,
				answer: seen.answer,
				facts: factIdsIn({ folder: workspaceFactsFolder({ workspace: packed.workspace }) }),
				record: readAnswerRecord({ asked: packed }),
			}).toMatchObject({
				verdict: 0,
				answer: { exitCode: 2, output: expect.stringMatching(IN_PROGRESS_WORDS) },
				facts: [FIRST_FACT],
				record: undefined,
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a verdict is asked while a person answer holds the ask -> the verdict is refused (exit 2, in progress); the answer is recorded: one fact, the round not closed',
		async () => {
			const packed = await packedForVerdict()
			const files = reportFilesOf({ packed, reports: agreeingReportsOf({ packed }) })
			const seen: { verdict: CommandOutput | undefined } = { verdict: undefined }

			const answer = await runAskAnswer({
				...answerParamsOf({ asked: packed }),
				afterFact: async function verdictMeanwhile() {
					seen.verdict = await runAskVerdict(verdictParamsOf({ packed, files }))
				},
			})

			expect({
				answer: answer.exitCode,
				verdict: seen.verdict,
				facts: factIdsIn({ folder: workspaceFactsFolder({ workspace: packed.workspace }) }),
				closed: existsSync(
					join(roundFolderOf({ asked: packed, round: ROUND_ONE }), 'verdict.json'),
				),
			}).toMatchObject({
				answer: 0,
				verdict: { exitCode: 2, output: expect.stringMatching(IN_PROGRESS_WORDS) },
				facts: [FIRST_FACT],
				closed: false,
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('ask answer and ask verdict respect a claim held on the ask', () => {
	it(
		'the ask claim is held by a live process -> ask answer is refused (exit 2) naming it in progress; nothing recorded, the claim left as it was',
		async () => {
			const asked = await askedPersonOnly({ documents: true })
			writeClaimFile({ path: askClaimOf({ asked }), pid: process.pid, ageMs: 0 })

			const answer = await runAskAnswer(answerParamsOf({ asked }))

			expect({
				answer,
				facts: factIdsIn({ folder: workspaceFactsFolder({ workspace: asked.workspace }) }),
				record: readAnswerRecord({ asked }),
				claimLeft: existsSync(askClaimOf({ asked })),
			}).toMatchObject({
				answer: { exitCode: 2, output: expect.stringMatching(IN_PROGRESS_WORDS) },
				facts: [],
				record: undefined,
				claimLeft: true,
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'the ask claim is held by a live process -> ask verdict is refused (exit 2) naming it in progress; nothing recorded, the claim left as it was',
		async () => {
			const packed = await packedForVerdict()
			const files = reportFilesOf({ packed, reports: agreeingReportsOf({ packed }) })
			writeClaimFile({ path: askClaimOf({ asked: packed }), pid: process.pid, ageMs: 0 })

			const verdict = await runAskVerdict(verdictParamsOf({ packed, files }))

			expect({
				verdict,
				facts: factIdsIn({ folder: workspaceFactsFolder({ workspace: packed.workspace }) }),
				claimLeft: existsSync(askClaimOf({ asked: packed })),
			}).toMatchObject({
				verdict: { exitCode: 2, output: expect.stringMatching(IN_PROGRESS_WORDS) },
				facts: [],
				claimLeft: true,
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'the ask claim left by a process that is gone, older than any stale limit -> ask answer takes it over, records, and removes the claim',
		async () => {
			const asked = await askedPersonOnly({ documents: true })
			writeClaimFile({ path: askClaimOf({ asked }), pid: deadProcessId(), ageMs: A_YEAR_MS })

			const answer = await runAskAnswer(answerParamsOf({ asked }))

			expect({
				exitCode: answer.exitCode,
				facts: factIdsIn({ folder: workspaceFactsFolder({ workspace: asked.workspace }) }),
				claimLeft: existsSync(askClaimOf({ asked })),
			}).toEqual({ exitCode: 0, facts: [FIRST_FACT], claimLeft: false })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('ask answer after a crash between the fact and answer.json', () => {
	it(
		'a crash right after the fact is recorded, then the same answer again -> one fact recorded once, and answer.json naming it',
		async () => {
			const asked = await askedPersonOnly({ documents: true })

			await expect(
				runAskAnswer({
					...answerParamsOf({ asked }),
					afterFact: function crash() {
						throw new Error(FORCED_CRASH)
					},
				}),
			).rejects.toThrow(FORCED_CRASH)
			const retry = await runAskAnswer(answerParamsOf({ asked }))

			const folder = workspaceFactsFolder({ workspace: asked.workspace })
			expect({
				exitCode: retry.exitCode,
				facts: factIdsIn({ folder }),
				events: readHistoryFile({ folder, id: FIRST_FACT }).map((line) => line.event),
				record: readAnswerRecord({ asked }),
			}).toMatchObject({
				exitCode: 0,
				facts: [FIRST_FACT],
				events: ['created'],
				record: { ask: asked.ask, fact: FIRST_FACT },
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'another asks folder holds an ask of the same id and question that a person answered (its fact names the ask) -> this ask answer records its own fact, never that one',
		async () => {
			const asked = await askedPersonOnly({ documents: true })
			const other = recordFactOfAsk({ asked, draft: EARLIER_PERSON_DRAFT })

			const json = await personAnsweredJson({ asked, exitCode: 0 })

			expect({
				json,
				facts: factIdsIn({ folder: workspaceFactsFolder({ workspace: asked.workspace }) }),
			}).toMatchObject({
				json: { ask: asked.ask, fact: 'F-0002' },
				facts: [other, 'F-0002'],
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})
