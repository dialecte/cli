/**
 * `dialecte lot result <id> [--json]` (33S section 7, G10; cases 15 and 43): never blocks and writes nothing. A
 * `ready` or `committed` lot gives its hand-over (name, folder, state, the card of `handover show --json`, the show
 * and run lines), worktree, branch and answered questions; `failed` and `canceled` give `{ state, reason, at,
 * position }` and exit 1; `input-required` the open questions and exit 3; `working` exit 5; an unknown id exit 2.
 * The text form prints agent text escaped (`\u{<hex>}`), as `--json` carries it as stored (G15).
 */
import { show, setEntryState } from '../../test/handover-store-scenario.ts'
import {
	bytesOf,
	registeredFolders,
	startRealLot,
	statusOf,
} from '../../test/lot-handover-workspace.ts'
import { QUESTION_LOT } from '../../test/lot-questions.constants.ts'
import { createQuestionLot, questionWith } from '../../test/lot-questions.ts'
import { snapshotOf, withJson } from '../../test/lot-start-workspace.ts'
import { LOT_NAME } from '../../test/lot-start.constants.ts'
import { ANSWERED } from '../../test/lot-stop-workspace.constants.ts'
import {
	commitReadyLotByHand,
	readyLot,
	readyLotWithAnsweredQuestion,
	resultOf,
	resultOfLot,
} from '../../test/lot-stop-workspace.ts'
import { startSimulated, createWaitTime, waitSimulated } from '../../test/simulated-lot.ts'
import { LATER_TIME } from '../../test/store-records.constants.ts'
import { transitionOf } from '../../test/store-records.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { rawHostileCharactersIn } from '../../test/unsafe-characters.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LotHandoverWorkspace } from '../../test/lot-handover-workspace.types.ts'
import type { ReadyLot } from '../../test/lot-stop-workspace.types.ts'
import type { SimulatedLot } from '../../test/simulated-lot.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/**
 * The card `handover show --json` gives for the lot's hand-over, without the two fields the result carries elsewhere
 * and without `processes` (the result never runs `lsof`).
 */
function cardOfShow(ready: ReadyLot): unknown {
	const shown = JSON.parse(
		show({ cwd: ready.lot.worktree, argv: [ready.name, '--json'] }).output,
	) as Record<string, unknown>
	const { folder: _folder, changedSinceReview: _changed, processes: _processes, ...card } = shown
	return card
}

/** What `lot status --json` says of the lot's worktree and branch. */
function worktreeAndBranchOf(lot: LotHandoverWorkspace): { worktree: unknown; branch: unknown } {
	const { json } = statusOf({ lot, argument: lot.lotName })
	const { worktree, branch } = json as { worktree: unknown; branch: unknown }
	return { worktree, branch }
}

describe('lot result of a ready lot', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a ready lot with a written hand-over -> exit 0, the hand-over, the card of handover show --json, show and run, worktree, branch, nothing written', () => {
		const ready = readyLot()
		const { lot, name } = ready
		const before = bytesOf(lot)

		expect(withJson(resultOfLot({ lot }))).toMatchObject({
			exitCode: 0,
			json: {
				lot: lot.lotName,
				state: 'ready',
				handover: {
					name,
					folder: registeredFolders(lot)[0],
					state: 'pending',
					card: cardOfShow(ready),
					show: `dialecte handover show ${name}`,
					run: `dialecte handover run ${name}`,
				},
				...worktreeAndBranchOf(lot),
				questions: [],
				simulated: false,
			},
		})
		expect(bytesOf(lot)).toEqual(before)
	})

	it('a ready lot with a written hand-over -> the card of the result holds no processes field (the result never runs lsof)', () => {
		const { lot } = readyLot()

		const { json } = withJson(resultOfLot({ lot })) as {
			json: { handover: { card: Record<string, unknown> } }
		}

		expect(Object.keys(json.handover.card)).not.toContain('processes')
	})

	it('a question asked and answered before the hand-over was written -> listed with its answer and who gave it', () => {
		const { lot } = readyLotWithAnsweredQuestion()
		const before = bytesOf(lot)

		expect(withJson(resultOfLot({ lot }))).toMatchObject({
			exitCode: 0,
			json: { state: 'ready', questions: [ANSWERED] },
		})
		expect(bytesOf(lot)).toEqual(before)
	})

	it('the lots committed by hand in git, the registry still pending (case 43) -> exit 0, state ready, the hand-over state committed beside it, nothing written', () => {
		const { lot, name } = readyLot()
		commitReadyLotByHand(lot)
		const before = bytesOf(lot)

		expect(withJson(resultOfLot({ lot }))).toMatchObject({
			exitCode: 0,
			json: { state: 'ready', handover: { name, state: 'committed' } },
		})
		expect(bytesOf(lot)).toEqual(before)
	})

	it('a hand-over committed and recorded -> exit 0, state committed, the hand-over state committed', () => {
		const { lot, name } = readyLot()
		commitReadyLotByHand(lot)
		setEntryState({ root: lot.start.repository, name, state: 'committed' })
		const before = bytesOf(lot)

		expect(withJson(resultOfLot({ lot }))).toMatchObject({
			exitCode: 0,
			json: { state: 'committed', handover: { name, state: 'committed' } },
		})
		expect(bytesOf(lot)).toEqual(before)
	})
})

describe('lot result of a lot that is not ready', { timeout: STORE_CASE_TIMEOUT }, () => {
	const ENDED = [
		{ state: 'failed', kind: 'fail' },
		{ state: 'canceled', kind: 'stop' },
	] as const
	// the ending transition's own position: not the first transition's (step 1 of 3, no station)
	const ENDING_POSITION = { step: 4, of: 6, station: 'implementer', round: 1 }
	for (const ended of ENDED)
		it(`a lot ${ended.state} -> exit 1 with { state, reason, at, position }, nothing written`, () => {
			const lot = createQuestionLot({
				later: [
					{
						...transitionOf({ seq: 2, state: ended.state, kind: ended.kind, at: LATER_TIME }),
						cause: { kind: ended.kind, by: 'engine', reason: `${ended.state} at the last step` },
						position: ENDING_POSITION,
					},
				],
			})
			const before = JSON.stringify([snapshotOf(lot.lotFolder), snapshotOf(lot.workspace.registry)])

			expect(withJson(resultOf({ cwd: lot.workspace.repository, id: QUESTION_LOT }))).toMatchObject(
				{
					exitCode: 1,
					json: {
						state: ended.state,
						reason: `${ended.state} at the last step`,
						at: LATER_TIME,
						position: ENDING_POSITION,
					},
				},
			)
			expect(JSON.stringify([snapshotOf(lot.lotFolder), snapshotOf(lot.workspace.registry)])).toBe(
				before,
			)
		})

	it('a lot input-required (case 15) -> exit 3 with the open questions, nothing written', () => {
		const lot = createQuestionLot({ question: questionWith() })
		const before = JSON.stringify([snapshotOf(lot.lotFolder), snapshotOf(lot.workspace.registry)])

		expect(withJson(resultOf({ cwd: lot.workspace.repository, id: QUESTION_LOT }))).toMatchObject({
			exitCode: 3,
			json: { state: 'input-required', questions: [{ id: 'q1', text: ANSWERED.text }] },
		})
		expect(JSON.stringify([snapshotOf(lot.lotFolder), snapshotOf(lot.workspace.registry)])).toBe(
			before,
		)
	})

	it('a lot working (case 15) -> exit 5, nothing written', () => {
		const lot = startRealLot()
		const before = bytesOf(lot)

		expect(withJson(resultOfLot({ lot }))).toMatchObject({
			exitCode: 5,
			json: { state: 'working' },
		})
		expect(bytesOf(lot)).toEqual(before)
	})

	it('a lot working, asked without --json -> exit 5', () => {
		const lot = startRealLot()

		expect(resultOfLot({ lot, json: false })).toMatchObject({ exitCode: 5 })
	})

	it('an id no lot has -> exit 2 naming it', () => {
		const lot = startRealLot()

		expect(resultOf({ cwd: lot.start.repository, id: '0099-nothing' })).toMatchObject({
			exitCode: 2,
			output: expect.stringContaining('0099-nothing'),
		})
	})
})

/** A simulated lot of the `ready` scenario, played to its `ready`. */
async function playedReadyLot(): Promise<SimulatedLot> {
	const simulated = startSimulated({ scenario: 'ready' })
	await waitSimulated({ lot: simulated, time: createWaitTime() })
	return simulated
}

describe('lot result of a simulated lot', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a simulated lot played to ready -> exit 0, state ready, simulated true, handover { simulated: true }, nothing written', async () => {
		const simulated = await playedReadyLot()
		const before = JSON.stringify([
			snapshotOf(simulated.lotFolder),
			snapshotOf(simulated.start.workspace.registry),
		])

		expect(withJson(resultOf({ cwd: simulated.start.repository, id: LOT_NAME }))).toMatchObject({
			exitCode: 0,
			json: { lot: LOT_NAME, state: 'ready', handover: { simulated: true }, simulated: true },
		})
		expect(
			JSON.stringify([
				snapshotOf(simulated.lotFolder),
				snapshotOf(simulated.start.workspace.registry),
			]),
		).toBe(before)
	})

	it('the same lot -> handover holds nothing but simulated: no show line, no run line for a host to run', async () => {
		const simulated = await playedReadyLot()

		expect(
			(
				JSON.parse(resultOf({ cwd: simulated.start.repository, id: LOT_NAME }).output) as {
					handover: unknown
				}
			).handover,
		).toEqual({ simulated: true })
	})
})

const HOSTILE_TEXT = 'ok\u{202e}evil\u001B[2J'
const HOSTILE_ESCAPED = 'ok\\u{202e}evil\\u{1b}[2J'

describe('lot result, the text form', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a canceled lot whose reason holds a bidi override and a terminal escape -> the text prints them escaped, --json carries the reason as stored', () => {
		const lot = createQuestionLot({
			later: [
				{
					...transitionOf({ seq: 2, state: 'canceled', kind: 'stop', at: LATER_TIME }),
					cause: { kind: 'stop', by: 'caller', reason: HOSTILE_TEXT },
				},
			],
		})
		const cwd = lot.workspace.repository

		expect({
			text: resultOf({ cwd, id: QUESTION_LOT, json: false }).output,
			json: withJson(resultOf({ cwd, id: QUESTION_LOT })).json,
		}).toMatchObject({
			text: expect.stringContaining(HOSTILE_ESCAPED),
			json: { reason: HOSTILE_TEXT },
		})
		expect(rawHostileCharactersIn(resultOf({ cwd, id: QUESTION_LOT, json: false }).output)).toEqual(
			[],
		)
	})

	it('an input-required lot whose open question holds the same characters -> the text prints them escaped, --json carries the text as stored', () => {
		const lot = createQuestionLot({ question: questionWith({ text: HOSTILE_TEXT }) })
		const cwd = lot.workspace.repository

		expect({
			exitCode: resultOf({ cwd, id: QUESTION_LOT, json: false }).exitCode,
			text: resultOf({ cwd, id: QUESTION_LOT, json: false }).output,
			json: withJson(resultOf({ cwd, id: QUESTION_LOT })).json,
		}).toMatchObject({
			exitCode: 3,
			text: expect.stringContaining(HOSTILE_ESCAPED),
			json: { questions: [{ id: 'q1', text: HOSTILE_TEXT }] },
		})
		expect(rawHostileCharactersIn(resultOf({ cwd, id: QUESTION_LOT, json: false }).output)).toEqual(
			[],
		)
	})

	it('a ready lot -> exit 0, the text names the hand-over and holds its show line and its run line', () => {
		const { lot, name } = readyLot()

		expect(resultOfLot({ lot, json: false })).toMatchObject({
			exitCode: 0,
			output: expect.stringMatching(
				new RegExp(
					`(?=[\\s\\S]*dialecte handover show ${name})(?=[\\s\\S]*dialecte handover run ${name})`,
				),
			),
		})
	})
})
