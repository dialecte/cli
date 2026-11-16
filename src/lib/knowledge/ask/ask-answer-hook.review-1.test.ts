/**
 * Review round 1, R1-11 and R1-6 (D43 2): the answer hook keeps its synchronous contract (the note is written before
 * it returns, after a bounded wait on the note's claim, a refusal to standard error past it); it takes the ask's
 * claim before it records; a retry after a crash between the fact and `answer.json` records no second fact.
 */
import { join } from 'node:path'

import {
	LOT_ANSWER_TEXT,
	LOT_STANDARD_FILE,
	NOTE_LOCK_FILE,
	PERSON,
} from '../../../../test/ask-answer-fixtures.constants.ts'
import {
	askedInLot,
	factIdsIn,
	pointProcessAt,
	readAnswerRecord,
	writeClaimFile,
} from '../../../../test/ask-answer-fixtures.ts'
import { readJsonFile } from '../../../../test/ask-command-workspace.ts'
import { workspaceFactsFolder } from '../../../../test/ask-fix-1-fixtures.ts'
import {
	ASK_CLAIM_FILE,
	EARLIER_PERSON_DRAFT,
	FORCED_CRASH,
	HOLD_MS,
	IN_PROGRESS_WORDS,
	SHORT_WAIT_LIMIT_MS,
} from '../../../../test/ask-review-1-fixtures.constants.ts'
import {
	hookInputOf,
	recordFactOfAsk,
	releaseClaimLater,
	writePersonMarker,
} from '../../../../test/ask-review-1-fixtures.ts'
import { readHistoryFile } from '../../../../test/fact-fixtures.ts'
import { LOT_NAME } from '../../../../test/lot-stores.constants.ts'
import { STORE_CASE_TIMEOUT } from '../../../../test/test-timing.constants.ts'
import { askAnswerHook } from './ask-answer-hook.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
	vi.restoreAllMocks()
})

/** The lines written to standard error while `run` runs. */
function stderrDuring(run: () => void): string[] {
	const lines: string[] = []
	vi.spyOn(process.stderr, 'write').mockImplementation(function collect(chunk) {
		lines.push(String(chunk))
		return true
	})
	run()
	return lines
}

describe('the answer hook writes the lot note before it returns', () => {
	it(
		'the note claim is held by another process for a moment -> the hook waits for it: once it returns the note says the ask is answered, all confirmed',
		async () => {
			const asked = await askedInLot({ documents: false, exitCode: 3 })
			pointProcessAt({ workspace: asked.workspace })
			const claim = join(asked.lotFolder, NOTE_LOCK_FILE)
			writeClaimFile({ path: claim, pid: process.pid, ageMs: 0 })
			releaseClaimLater({ path: claim, afterMs: HOLD_MS })

			askAnswerHook(hookInputOf({ asked, text: LOT_ANSWER_TEXT, by: PERSON }))

			expect(readJsonFile(join(asked.lotFolder, LOT_STANDARD_FILE))).toMatchObject({
				note: 'asks A-0001 answered F-0001 (all confirmed)',
			})
		},
		STORE_CASE_TIMEOUT,
	)

	it(
		'the note claim is held past the wait limit -> the hook returns, the answer is kept, and a line on standard error names the claim',
		async () => {
			const asked = await askedInLot({ documents: false, exitCode: 3 })
			pointProcessAt({ workspace: asked.workspace })
			const claim = join(asked.lotFolder, NOTE_LOCK_FILE)
			writeClaimFile({ path: claim, pid: process.pid, ageMs: 0 })

			const lines = stderrDuring(function runHook() {
				askAnswerHook({
					...hookInputOf({ asked, text: LOT_ANSWER_TEXT, by: PERSON }),
					seams: { waitLimitMs: SHORT_WAIT_LIMIT_MS },
				})
			})

			expect({ stderr: lines.join(''), answer: readAnswerRecord({ asked }) }).toMatchObject({
				stderr: expect.stringContaining(claim),
				answer: { ask: asked.ask, fact: 'F-0001' },
			})
		},
		STORE_CASE_TIMEOUT,
	)
})

describe('the answer hook after a crash between the fact and answer.json', () => {
	it(
		'a crash right after the fact is recorded, then the hook again -> one fact, recorded once, and answer.json naming it',
		async () => {
			const asked = await askedInLot({ documents: false, exitCode: 3 })
			pointProcessAt({ workspace: asked.workspace })
			const input = hookInputOf({ asked, text: LOT_ANSWER_TEXT, by: PERSON })

			expect(() =>
				askAnswerHook({
					...input,
					seams: {
						afterFact: function crash() {
							throw new Error(FORCED_CRASH)
						},
					},
				}),
			).toThrow(FORCED_CRASH)
			askAnswerHook(input)

			const folder = workspaceFactsFolder({ workspace: asked.workspace })
			expect({
				facts: factIdsIn({ folder }),
				events: readHistoryFile({ folder, id: 'F-0001' }).map((line) => line.event),
				answer: readAnswerRecord({ asked }),
			}).toMatchObject({
				facts: ['F-0001'],
				events: ['created'],
				answer: { ask: asked.ask, fact: 'F-0001' },
			})
		},
		STORE_CASE_TIMEOUT,
	)

	it(
		'the ask already holds a fact an earlier run recorded for it, no answer.json -> the hook publishes answer.json with that fact and records nothing new',
		async () => {
			const asked = await askedInLot({ documents: false, exitCode: 3 })
			pointProcessAt({ workspace: asked.workspace })
			const earlier = recordFactOfAsk({ asked, draft: EARLIER_PERSON_DRAFT, lot: LOT_NAME })
			writePersonMarker({ asked, draft: EARLIER_PERSON_DRAFT })

			askAnswerHook(hookInputOf({ asked, text: LOT_ANSWER_TEXT, by: PERSON }))

			const folder = workspaceFactsFolder({ workspace: asked.workspace })
			expect({
				facts: factIdsIn({ folder }),
				events: readHistoryFile({ folder, id: earlier }).map((line) => line.event),
				answer: readAnswerRecord({ asked }),
			}).toMatchObject({
				facts: [earlier],
				events: ['created'],
				answer: { ask: asked.ask, fact: earlier },
			})
		},
		STORE_CASE_TIMEOUT,
	)

	it(
		'a person fact with the ask in its history but no answering marker of this ask (another asks folder holds an ask of the same id and question) -> the hook records its own fact',
		async () => {
			const asked = await askedInLot({ documents: false, exitCode: 3 })
			pointProcessAt({ workspace: asked.workspace })
			const other = recordFactOfAsk({ asked, draft: EARLIER_PERSON_DRAFT })

			askAnswerHook(hookInputOf({ asked, text: LOT_ANSWER_TEXT, by: PERSON }))

			expect({
				facts: factIdsIn({ folder: workspaceFactsFolder({ workspace: asked.workspace }) }),
				answer: readAnswerRecord({ asked }),
			}).toMatchObject({
				facts: [other, 'F-0002'],
				answer: { ask: asked.ask, fact: 'F-0002' },
			})
		},
		STORE_CASE_TIMEOUT,
	)
})

describe('the answer hook takes the ask claim before it records', () => {
	it(
		'the ask claim is held by a live process -> the hook refuses, naming it in progress, and records nothing',
		async () => {
			const asked = await askedInLot({ documents: false, exitCode: 3 })
			pointProcessAt({ workspace: asked.workspace })
			writeClaimFile({
				path: join(asked.asksFolder, asked.ask, ASK_CLAIM_FILE),
				pid: process.pid,
				ageMs: 0,
			})

			expect(() =>
				askAnswerHook(hookInputOf({ asked, text: LOT_ANSWER_TEXT, by: PERSON })),
			).toThrow(IN_PROGRESS_WORDS)
			expect({
				facts: factIdsIn({ folder: workspaceFactsFolder({ workspace: asked.workspace }) }),
				answer: readAnswerRecord({ asked }),
			}).toEqual({ facts: [], answer: undefined })
		},
		STORE_CASE_TIMEOUT,
	)

	it(
		'the refusal names the way on: the ask answer command with its quoted answer and --by',
		async () => {
			const asked = await askedInLot({ documents: false, exitCode: 3 })
			pointProcessAt({ workspace: asked.workspace })
			writeClaimFile({
				path: join(asked.asksFolder, asked.ask, ASK_CLAIM_FILE),
				pid: process.pid,
				ageMs: 0,
			})

			expect(() =>
				askAnswerHook(hookInputOf({ asked, text: LOT_ANSWER_TEXT, by: PERSON })),
			).toThrow(`dialecte ask answer ${asked.ask} "<answer>" --by <who>`)
		},
		STORE_CASE_TIMEOUT,
	)
})
