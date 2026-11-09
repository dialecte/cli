/**
 * `dialecte lot stop <id> --reason <text> [--by <who>] [--json]` (33S section 7, steps 1-3; G11; cases 20, 28, 52, 54):
 * `committed` and a reason that is empty or on several lines exit 2 and write nothing; a lot already canceled with
 * no pending entry exits 0 and writes nothing; a ready lot has its hand-over abandoned first, then a `canceled`
 * transition (cause stop, the reason, by) is published; a run in progress refuses; a lot working without a worktree
 * or failed is canceled with nothing abandoned and nothing removed.
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'

import { runIn, setEntryState, headOf } from '../../test/handover-store-scenario.ts'
import { bytesOf, entryPathOf, startRealLot } from '../../test/lot-handover-workspace.ts'
import { createQuestionLot, questionWith, transitionFilesOf } from '../../test/lot-questions.ts'
import { snapshotOf, withJson } from '../../test/lot-start-workspace.ts'
import { LOT_NAME } from '../../test/lot-start.constants.ts'
import { STOP_NOW, STOP_REASON } from '../../test/lot-stop-workspace.constants.ts'
import {
	abandonedMarkerOf,
	commitReadyLotByHand,
	differenceOf,
	lockHeld,
	readyLot,
	stopLot,
	stopOf,
	stopQuestionLot,
	stopTwiceOf,
	transitionSummaryOf,
	worktreeAndBranchOf,
	worktreesKept,
	writeLiveRunMarker,
} from '../../test/lot-stop-workspace.ts'
import { createWorkspaceWithLots, writeStoreListFile } from '../../test/lot-stores.ts'
import { createWaitTime, startSimulated, waitSimulated } from '../../test/simulated-lot.ts'
import { LATER_TIME } from '../../test/store-records.constants.ts'
import { transitionOf } from '../../test/store-records.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { HANDOVER_FILES, HANDOVER_RUN_MARKER_FILE } from '../lib/handover/handover.constants.ts'
import { lotStatusOf } from './lot-status.ts'
import { lotStop } from './lot-stop.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { QuestionLot } from '../../test/lot-questions.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** Everything the store holds for a hand-written lot: its folder and the registry, as text. */
function storeBytesOf(lot: QuestionLot): string {
	return JSON.stringify([snapshotOf(lot.lotFolder), snapshotOf(lot.workspace.registry)])
}

describe(
	'lot stop: what it refuses and what it leaves alone',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('a committed lot -> exit 2 naming committed, nothing written', () => {
			const { lot, name } = readyLot()
			commitReadyLotByHand(lot)
			setEntryState({ root: lot.start.repository, name, state: 'committed' })
			const before = bytesOf(lot)

			expect(stopLot({ lot })).toMatchObject({
				exitCode: 2,
				output: expect.stringMatching(/committed/),
			})
			expect(bytesOf(lot)).toEqual(before)
		})

		it('a committed lot, asked with --json -> exit 2, JSON { error, next: null }', () => {
			const { lot, name } = readyLot()
			commitReadyLotByHand(lot)
			setEntryState({ root: lot.start.repository, name, state: 'committed' })

			expect(withJson(stopLot({ lot, json: true }))).toMatchObject({
				exitCode: 2,
				json: { error: expect.stringMatching(/committed/), next: null },
			})
		})

		it('a lot already canceled by a transition, no registry entry (case 20) -> exit 0, nothing written', () => {
			const lot = createQuestionLot({
				later: [transitionOf({ seq: 2, state: 'canceled', kind: 'stop', at: LATER_TIME })],
			})
			const before = storeBytesOf(lot)

			expect(stopQuestionLot({ lot })).toMatchObject({ exitCode: 0 })
			expect(storeBytesOf(lot)).toBe(before)
		})

		it('a ready lot stopped twice (case 20, twice) -> both exit 0, the second writes nothing', () => {
			const { lot } = readyLot()

			expect(stopTwiceOf(lot)).toEqual({ first: 0, second: 0, secondWroteNothing: true })
		})

		const BAD_REASONS = [
			{ title: 'empty', reason: '' },
			{ title: 'blank', reason: '   ' },
			{ title: 'on two lines', reason: 'first line\nsecond line' },
			{ title: 'on two lines by a lone carriage return', reason: 'first line\rsecond line' },
		]
		for (const row of BAD_REASONS)
			it(`a reason ${row.title} -> exit 2, nothing written`, () => {
				const lot = startRealLot()
				const before = bytesOf(lot)

				expect(
					stopOf({ cwd: lot.start.repository, id: lot.lotName, reason: row.reason }),
				).toMatchObject({
					exitCode: 2,
				})
				expect(bytesOf(lot)).toEqual(before)
			})

		it('no --reason at all -> exit 2, nothing written', () => {
			const lot = startRealLot()
			const before = bytesOf(lot)

			expect(
				lotStop({ cwd: lot.start.repository, argv: [lot.lotName], now: STOP_NOW }),
			).toMatchObject({
				exitCode: 2,
			})
			expect(bytesOf(lot)).toEqual(before)
		})

		it('an id no lot has -> exit 2 naming it', () => {
			const lot = startRealLot()

			expect(stopOf({ cwd: lot.start.repository, id: '0099-nothing' })).toMatchObject({
				exitCode: 2,
				output: expect.stringContaining('0099-nothing'),
			})
		})

		it('an index two stores hold, asked from the repository of one of them (a write verb) -> exit 2 listing both full names, neither lot stopped', () => {
			const first = createWorkspaceWithLots({ names: ['0005-repo-b'] })
			const second = createWorkspaceWithLots({ names: ['0005-repo-c'] })
			writeStoreListFile({
				stores: [first, second].map((each) => realpathSync(each.workspace.store)),
			})
			const before = [first, second].map((each) => JSON.stringify(snapshotOf(each.workspace.store)))

			expect(stopOf({ cwd: first.workspace.repository, id: '0005' })).toMatchObject({
				exitCode: 2,
				output: expect.stringMatching(/(?=[\s\S]*0005-repo-b)(?=[\s\S]*0005-repo-c)/),
			})
			expect(
				[first, second].map((each) => JSON.stringify(snapshotOf(each.workspace.store))),
			).toEqual(before)
		})
	},
)

describe('lot stop of a ready lot', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a ready lot (case 20) -> exit 0, the hand-over abandoned first: abandoned.json at the stop time, the entry abandoned, the lock released', () => {
		const { lot, name } = readyLot()

		expect(stopLot({ lot })).toMatchObject({ exitCode: 0 })

		expect(abandonedMarkerOf(lot)).toEqual({ at: STOP_NOW.toISOString() })
		expect(JSON.parse(readFileSync(entryPathOf({ lot, name }), 'utf8'))).toMatchObject({
			state: 'abandoned',
		})
		expect(lockHeld(lot)).toBe(false)
		expect(worktreeAndBranchOf(lot)).toEqual({ worktree: true, branch: true })
	})

	it('a ready lot -> then a canceled transition with cause stop, the reason, by caller, at the stop time', () => {
		const { lot } = readyLot()

		expect(stopLot({ lot })).toMatchObject({ exitCode: 0 })

		expect(transitionFilesOf(lot.lotFolder).at(-1)).toMatchObject({
			seq: 2,
			state: 'canceled',
			at: STOP_NOW.toISOString(),
			cause: { kind: 'stop', by: 'caller', reason: STOP_REASON },
			question: null,
			simulated: false,
		})
	})

	it('a ready lot stopped --by a-person -> the transition names a-person', () => {
		const { lot } = readyLot()

		expect(stopLot({ lot, by: 'a-person' })).toMatchObject({ exitCode: 0 })

		expect(transitionFilesOf(lot.lotFolder).at(-1)).toMatchObject({
			cause: { kind: 'stop', by: 'a-person', reason: STOP_REASON },
		})
	})

	it('a ready lot, asked with --json -> the status after the stop: state canceled, next null', () => {
		const { lot } = readyLot()

		expect(withJson(stopLot({ lot, json: true }))).toMatchObject({
			exitCode: 0,
			json: { lot: lot.lotName, state: 'canceled', next: null },
		})
	})

	it('a lot stopped -> its status next is null, and the lot no longer keeps its worktree', () => {
		const { lot } = readyLot()

		expect(stopLot({ lot })).toMatchObject({ exitCode: 0 })

		expect(lotStatusOf({ lotFolder: lot.lotFolder })).toMatchObject({
			state: 'canceled',
			next: null,
			also: [],
		})
		expect(worktreesKept(lot)).toEqual([])
	})

	it('a ready lot stopped (case 20) -> commit.sh then refuses: handover run on the lot folder exits 2 naming canceled, nothing committed', async () => {
		const { lot } = readyLot()
		const headBefore = headOf(lot.worktree)

		expect(stopLot({ lot })).toMatchObject({ exitCode: 0 })

		const run = await runIn({ cwd: lot.worktree, argv: [lot.lotFolder] })
		expect({ exitCode: run.exitCode, text: run.text }).toMatchObject({
			exitCode: 2,
			text: expect.stringContaining('canceled'),
		})
		expect(headOf(lot.worktree)).toBe(headBefore)
	})

	it('a handover run in progress, a live run marker (case 20) -> exit 2 naming the run, nothing published, nothing abandoned', () => {
		const { lot } = readyLot()
		writeLiveRunMarker(lot.lotFolder)
		const before = bytesOf(lot)

		expect(stopLot({ lot })).toMatchObject({
			exitCode: 2,
			output: expect.stringMatching(/running/),
		})

		expect(bytesOf(lot)).toEqual(before)
		expect(existsSync(join(lot.lotFolder, HANDOVER_FILES.abandoned))).toBe(false)
		expect(existsSync(join(lot.lotFolder, HANDOVER_RUN_MARKER_FILE))).toBe(true)
		expect(transitionSummaryOf(lot.lotFolder)).toEqual(['1:working:start'])
	})

	it('every lot of the hand-over committed by hand, the registry still pending -> exit 2 naming committed, nothing published, nothing abandoned', () => {
		const { lot } = readyLot()
		commitReadyLotByHand(lot)
		const before = bytesOf(lot)

		expect(stopLot({ lot })).toMatchObject({
			exitCode: 2,
			output: expect.stringMatching(/committed/),
		})

		expect(bytesOf(lot)).toEqual(before)
	})

	it('the lot input-required (a person has not answered) -> exit 0, canceled, its questions no longer open', () => {
		const lot = createQuestionLot({ question: questionWith() })

		expect(stopQuestionLot({ lot })).toMatchObject({ exitCode: 0 })

		expect(lotStatusOf({ lotFolder: lot.lotFolder })).toMatchObject({
			state: 'canceled',
			questions: [],
		})
	})
})

describe('lot stop of a lot that is not ready', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a lot working whose start died before its worktree was made (case 28) -> canceled, the only new file the transition, nothing removed', () => {
		const lot = createQuestionLot()
		const before = snapshotOf(lot.lotFolder)
		const registryBefore = snapshotOf(lot.workspace.registry)

		expect(lotStatusOf({ lotFolder: lot.lotFolder })?.checks.worktree).toBe('missing')
		expect(stopQuestionLot({ lot })).toMatchObject({ exitCode: 0 })

		expect(differenceOf({ before, after: snapshotOf(lot.lotFolder) })).toEqual({
			added: ['transitions/000002.json'],
			removed: [],
			changed: [],
		})
		expect(snapshotOf(lot.workspace.registry)).toEqual(registryBefore)
		expect(transitionFilesOf(lot.lotFolder).at(-1)).toMatchObject({
			state: 'canceled',
			cause: { kind: 'stop', reason: STOP_REASON },
		})
	})

	it('a lot working with its worktree -> canceled, the worktree and the lot folder files kept, no hand-over abandoned', () => {
		const lot = startRealLot()
		const before = snapshotOf(lot.lotFolder)

		expect(stopLot({ lot })).toMatchObject({ exitCode: 0 })

		expect(existsSync(lot.worktree)).toBe(true)
		expect(differenceOf({ before, after: snapshotOf(lot.lotFolder) })).toEqual({
			added: ['transitions/000002.json'],
			removed: [],
			changed: [],
		})
	})

	it('a lot failed (case 52) -> canceled as transition 3, nothing abandoned, the registry untouched', () => {
		const lot = createQuestionLot({
			later: [transitionOf({ seq: 2, state: 'failed', kind: 'fail', at: LATER_TIME })],
		})
		const registryBefore = snapshotOf(lot.workspace.registry)

		expect(stopQuestionLot({ lot })).toMatchObject({ exitCode: 0 })

		expect(transitionSummaryOf(lot.lotFolder)).toEqual([
			'1:working:start',
			'2:failed:fail',
			'3:canceled:stop',
		])
		expect(existsSync(join(lot.lotFolder, HANDOVER_FILES.abandoned))).toBe(false)
		expect(snapshotOf(lot.workspace.registry)).toEqual(registryBefore)
	})

	it('a simulated lot played to ready -> canceled by a transition that is itself simulated, no hand-over touched', async () => {
		const simulated = startSimulated({ scenario: 'ready' })
		await waitSimulated({ lot: simulated, time: createWaitTime() })

		expect(stopOf({ cwd: simulated.start.repository, id: LOT_NAME })).toMatchObject({ exitCode: 0 })

		expect(transitionFilesOf(simulated.lotFolder).at(-1)).toMatchObject({
			state: 'canceled',
			simulated: true,
			cause: { kind: 'stop', reason: STOP_REASON },
		})
	})
})
