/**
 * `lot stop` against a write, a run and a crash, each order forced by a seam or by records written by hand, never by
 * timing (33S section 4; cases 54, 59, 62): a `handover write` registering `pending` after the `canceled` transition
 * is abandoned by the re-read at once, and one landing after the re-read by the next stop; a live run crossing the
 * abandon takes its marker back and the stop publishes nothing; a kill between `abandoned.json` and the registry
 * record leaves a lot that reads canceled, repaired by the next stop.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { markAbandoned, setEntryState } from '../../test/handover-store-scenario.ts'
import {
	bytesOf,
	entryPathOf,
	statusOf,
	writeTransition,
} from '../../test/lot-handover-workspace.ts'
import { withJson } from '../../test/lot-start-workspace.ts'
import { STOP_NOW } from '../../test/lot-stop-workspace.constants.ts'
import {
	abandonedMarkerOf,
	detachEntry,
	lockHeld,
	readyLot,
	resultOfLot,
	stopLateWriteOf,
	stopLot,
	stopTwiceOf,
	transitionSummaryOf,
	worktreeAndBranchOf,
	worktreesKept,
	writeLiveRunMarker,
} from '../../test/lot-stop-workspace.ts'
import { LATER_TIME } from '../../test/store-records.constants.ts'
import { transitionOf } from '../../test/store-records.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { HANDOVER_FILES, HANDOVER_RUN_MARKER_FILE } from '../lib/handover/handover.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ReadyLot } from '../../test/lot-stop-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const STOPPED_ONCE = ['1:working:start', '2:canceled:stop']

/** The state the registry entry of the ready lot holds. */
function entryStateOf(ready: ReadyLot): unknown {
	return (JSON.parse(readFileSync(entryPathOf(ready), 'utf8')) as { state: unknown }).state
}

describe(
	'lot stop while a handover write registers pending (case 59)',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('the entry lands after the canceled transition, before the re-read -> the re-read abandons it at once: marker, entry abandoned, lock released, one canceled transition', () => {
			const ready = readyLot()
			const { lot } = ready
			const detached = detachEntry(ready)

			expect(stopLot({ lot, seams: { afterCanceled: () => detached.restore() } })).toMatchObject({
				exitCode: 0,
			})

			expect(abandonedMarkerOf(lot)).toEqual({ at: STOP_NOW.toISOString() })
			expect(entryStateOf(ready)).toBe('abandoned')
			expect(lockHeld(lot)).toBe(false)
			expect(transitionSummaryOf(lot.lotFolder)).toEqual(STOPPED_ONCE)
			expect(worktreesKept(lot)).toEqual([])
		})

		it('the entry lands after the re-read -> the stop that follows abandons it: exit 0, marker, entry abandoned, lock released, no second canceled transition', () => {
			const ready = readyLot()
			const { lot } = ready

			expect(stopLateWriteOf(ready)).toEqual({ first: 0, second: 0 })

			expect(abandonedMarkerOf(lot)).toEqual({ at: STOP_NOW.toISOString() })
			expect(entryStateOf(ready)).toBe('abandoned')
			expect(lockHeld(lot)).toBe(false)
			expect(transitionSummaryOf(lot.lotFolder)).toEqual(STOPPED_ONCE)
			expect(worktreesKept(lot)).toEqual([])
		})

		it('a canceled transition and a pending entry both on disk -> the stop repairs it: entry abandoned, marker, lock released, nothing else published', () => {
			const ready = readyLot()
			const { lot } = ready
			writeTransition({
				lotFolder: lot.lotFolder,
				transition: transitionOf({ seq: 2, state: 'canceled', kind: 'stop', at: LATER_TIME }),
			})

			expect(stopLot({ lot })).toMatchObject({ exitCode: 0 })

			expect(entryStateOf(ready)).toBe('abandoned')
			expect(existsSync(join(lot.lotFolder, HANDOVER_FILES.abandoned))).toBe(true)
			expect(lockHeld(lot)).toBe(false)
			expect(transitionSummaryOf(lot.lotFolder)).toEqual(STOPPED_ONCE)
		})
	},
)

describe(
	'lot stop while a run crosses its abandon (case 62)',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('the run marker appears between the check and the write of abandoned.json -> exit 2, the abandon taken back, nothing published, the entry and the lock kept', () => {
			const ready = readyLot()
			const { lot } = ready

			expect(
				stopLot({ lot, seams: { afterCheck: () => writeLiveRunMarker(lot.lotFolder) } }),
			).toMatchObject({ exitCode: 2, output: expect.stringMatching(/running/) })

			expect(existsSync(join(lot.lotFolder, HANDOVER_FILES.abandoned))).toBe(false)
			expect(existsSync(join(lot.lotFolder, HANDOVER_RUN_MARKER_FILE))).toBe(true)
			expect(entryStateOf(ready)).toBe('pending')
			expect(lockHeld(lot)).toBe(true)
			expect(transitionSummaryOf(lot.lotFolder)).toEqual(['1:working:start'])
		})

		it('the same stop -> a status read afterwards never reads canceled: the lot is ready, the run decides', () => {
			const ready = readyLot()
			const { lot } = ready

			expect(
				stopLot({ lot, seams: { afterCheck: () => writeLiveRunMarker(lot.lotFolder) } }),
			).toMatchObject({ exitCode: 2 })

			expect(statusOf({ lot, argument: lot.lotName })).toMatchObject({
				exitCode: 0,
				json: { state: 'ready', handover: { state: 'pending' } },
			})
		})
	},
)

describe(
	'lot stop after a kill inside its abandon (case 54)',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		/** The lot as a kill left it: abandoned.json written, the entry still pending, no canceled transition. */
		function killedBetweenMarkerAndRecord(): ReadyLot {
			const ready = readyLot()
			markAbandoned({ folder: ready.lot.lotFolder, file: HANDOVER_FILES.abandoned })
			return ready
		}

		it('abandoned.json and a pending entry -> the lot reads canceled and lot result offers no run', () => {
			const { lot } = killedBetweenMarkerAndRecord()

			expect(statusOf({ lot, argument: lot.lotName })).toMatchObject({
				json: { state: 'canceled' },
			})
			expect(withJson(resultOfLot({ lot }))).toMatchObject({
				exitCode: 1,
				json: { state: 'canceled' },
			})
			expect(resultOfLot({ lot }).output).not.toMatch(/handover run/)
		})

		it('a stop -> exit 0, the entry abandoned, the lock released, the marker as the kill left it, one canceled transition', () => {
			const ready = killedBetweenMarkerAndRecord()
			const { lot } = ready
			const markerBefore = readFileSync(join(lot.lotFolder, HANDOVER_FILES.abandoned), 'utf8')

			expect(stopLot({ lot })).toMatchObject({ exitCode: 0 })

			expect(entryStateOf(ready)).toBe('abandoned')
			expect(lockHeld(lot)).toBe(false)
			expect(readFileSync(join(lot.lotFolder, HANDOVER_FILES.abandoned), 'utf8')).toBe(markerBefore)
			expect(transitionSummaryOf(lot.lotFolder)).toEqual(STOPPED_ONCE)
		})

		it('a second stop -> exit 0 writing nothing, the entry abandoned, a canceled transition, and the keep rule lets the worktree go (lot close accepts it)', () => {
			const ready = killedBetweenMarkerAndRecord()
			const { lot } = ready

			expect(stopTwiceOf(lot)).toEqual({ first: 0, second: 0, secondWroteNothing: true })

			expect(entryStateOf(ready)).toBe('abandoned')
			expect(transitionSummaryOf(lot.lotFolder)).toEqual(STOPPED_ONCE)
			expect(worktreesKept(lot)).toEqual([])
			expect(worktreeAndBranchOf(lot)).toEqual({ worktree: true, branch: true })
		})

		it('a kill after the registry record and before the canceled transition (entry abandoned, abandoned.json, no canceled transition) -> exit 0, nothing written: already canceled with no pending entry', () => {
			const { lot, name } = readyLot()
			markAbandoned({ folder: lot.lotFolder, file: HANDOVER_FILES.abandoned })
			setEntryState({ root: lot.start.repository, name, state: 'abandoned' })
			const before = bytesOf(lot)

			expect(stopLot({ lot })).toMatchObject({ exitCode: 0 })

			expect(bytesOf(lot)).toEqual(before)
			expect(transitionSummaryOf(lot.lotFolder)).toEqual(['1:working:start'])
		})
	},
)
