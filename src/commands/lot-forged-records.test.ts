/**
 * Forged records make a lot read damaged (R4-2): a transition whose question id is no `q<k>`, whose audience is not
 * caller or person, whose position step, of or round is not a non-negative integer or whose time is no time, and an
 * answer file whose question is not its file's, are validated once, on read. The lot then reads like one with an
 * unreadable identity: `status`, `wait`, `result` and `answer` refuse it (exit 2) and `inbox` lists it as damaged;
 * no output, text or JSON, prints a forged field or a forged `next`.
 */
import { createBriefWorkspace, writeStoreLot } from '../../test/brief-workspace.ts'
import { inboxIn } from '../../test/inbox-workspace.ts'
import {
	DAMAGED_INBOX,
	FORGED,
	FORGED_ANSWERS,
	FORGED_TRANSITIONS,
} from '../../test/lot-forged-records.constants.ts'
import { QUESTION_LOT, QUESTION_NOW } from '../../test/lot-questions.constants.ts'
import { resultOf } from '../../test/lot-stop-workspace.ts'
import { writeStoreListFile } from '../../test/lot-stores.ts'
import { createWaitTime } from '../../test/simulated-lot.ts'
import { questionOf, transitionOf, writeRecordFile } from '../../test/store-records.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { waitLot } from './lot-wait.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { Transition } from '../lib/store/store.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The question transition a lot asks q1 with: the forged records change one field of it. */
const QUESTION_TRANSITION = transitionOf({ seq: 2, kind: 'question', question: questionOf(1) })

/** A transition of the question, with `patch` laid over it as a hand edit would. */
function forgedTransition(patch: Record<string, unknown>): Transition {
	return { ...QUESTION_TRANSITION, ...patch } as unknown as Transition
}

/** The lot of the question tests with its forged records written, in a store the inbox reads; its repository. */
function forgedLot(params: {
	transition?: Transition
	answer?: { file: string; question: string }
}): string {
	const workspace = createBriefWorkspace()
	const lotFolder = writeStoreLot({
		workspace,
		name: QUESTION_LOT,
		scope: ['src/'],
		later: [params.transition ?? QUESTION_TRANSITION],
		repository: workspace.repository,
	})
	if (params.answer !== undefined)
		writeRecordFile({
			folder: lotFolder,
			name: `answers/${params.answer.file}`,
			text: `${JSON.stringify({ question: params.answer.question, answer: 'keep', by: 'caller', at: QUESTION_NOW.toISOString() })}\n`,
		})
	writeStoreListFile({ stores: [workspace.store] })
	return workspace.repository
}

/** Each verb's text and `--json` form on the lot, from its repository. */
async function printedBy(cwd: string): Promise<Record<string, CommandResult>> {
	const waited = await Promise.all(
		[[], ['--json']].map((flags) => {
			const time = createWaitTime()
			return waitLot({ cwd, argv: [QUESTION_LOT, ...flags], clock: time.clock, sleep: time.sleep })
		}),
	)
	return {
		status: runLot({ cwd, argv: ['status', QUESTION_LOT] }),
		'status --json': runLot({ cwd, argv: ['status', QUESTION_LOT, '--json'] }),
		wait: waited[0],
		'wait --json': waited[1],
		result: resultOf({ cwd, id: QUESTION_LOT, json: false }),
		'result --json': resultOf({ cwd, id: QUESTION_LOT }),
		answer: runLot({ cwd, argv: ['answer', QUESTION_LOT, 'q1', 'keep'], now: QUESTION_NOW }),
		'answer --json': runLot({
			cwd,
			argv: ['answer', QUESTION_LOT, 'q1', 'keep', '--json'],
			now: QUESTION_NOW,
		}),
	}
}

/** Whether the output says the lot is damaged: the two lines of the text form, `state: damaged` in the JSON form. */
function showsDamaged(params: { verb: string; output: string }): boolean {
	if (params.verb.endsWith('--json')) {
		try {
			return (JSON.parse(params.output) as { state?: string }).state === 'damaged'
		} catch {
			return false
		}
	}
	const [first, second] = params.output.split('\n')
	return (
		first.startsWith(`${QUESTION_LOT} damaged: `) &&
		second === `next: dialecte lot stop ${QUESTION_LOT} --reason <text>`
	)
}

/** What each verb showed: its exit code, whether it says damaged, and whether a forged field reached its output. */
function summaryOf(printed: Record<string, CommandResult>): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(printed).map(([verb, result]) => [
			verb,
			{
				exitCode: result.exitCode,
				showsDamaged: showsDamaged({ verb, output: result.output }),
				printsForged: result.output.includes(FORGED),
			},
		]),
	)
}

/** What a damaged lot shows: status, wait and result answer damaged (exit 6), answer refuses (exit 2); nothing forged. */
function refusedEverywhere(printed: Record<string, CommandResult>): Record<string, unknown> {
	return Object.fromEntries(
		Object.keys(printed).map((verb) => [
			verb,
			verb.startsWith('answer')
				? { exitCode: 2, showsDamaged: false, printsForged: false }
				: { exitCode: 6, showsDamaged: true, printsForged: false },
		]),
	)
}

/** The inbox's text and JSON: the lot listed as damaged, never as waiting, nothing forged printed. */
function inboxSummaryOf(cwd: string): Record<string, unknown> {
	const text = inboxIn({ cwd })
	const json = inboxIn({ cwd, words: ['--json'] })
	const parsed = JSON.parse(json.output) as { waiting: unknown[]; damaged: unknown[] }
	return {
		exitCodes: [text.exitCode, json.exitCode],
		damagedLine: text.output.split('\n').some((line) => line.startsWith('damaged ')),
		waiting: parsed.waiting.length,
		damaged: parsed.damaged.length,
		printsForged: text.output.includes(FORGED) || json.output.includes(FORGED),
	}
}

describe('forged records read as a damaged lot', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of FORGED_TRANSITIONS)
		it(`${row.title} -> status, wait and result answer damaged (exit 6), answer refuses (exit 2), nothing forged is printed, the inbox lists it damaged`, async () => {
			const repository = forgedLot({ transition: forgedTransition(row.patch) })
			const printed = await printedBy(repository)

			expect(summaryOf(printed)).toEqual(refusedEverywhere(printed))
			expect(inboxSummaryOf(repository)).toEqual(DAMAGED_INBOX)
		})

	for (const row of FORGED_ANSWERS)
		it(`${row.title} -> status, wait and result answer damaged (exit 6), answer refuses (exit 2), nothing forged is printed, the inbox lists it damaged`, async () => {
			const repository = forgedLot({ answer: row })
			const printed = await printedBy(repository)

			expect(summaryOf(printed)).toEqual(refusedEverywhere(printed))
			expect(inboxSummaryOf(repository)).toEqual(DAMAGED_INBOX)
		})
})
