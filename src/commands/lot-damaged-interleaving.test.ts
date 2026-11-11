/**
 * A damaged lot against a stop, a run and a start, each order forced by a seam or by records written by hand, never
 * by timing (P2.4, P2.5): two stops racing on one damaged lot (one moves, the other says no lot); a stop while a live
 * run marker holds the lot (refused, nothing moved); a start racing a stop (the re-check after the publish never fails
 * open on a lot that turned damaged, and passes once the stop moved it aside).
 */
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { writeStoreLot } from '../../test/brief-workspace.ts'
import {
	DISJOINT_SCOPE,
	OVERLAPPING_SCOPE,
	SECOND_NAME,
} from '../../test/damaged-lot-workspace.constants.ts'
import {
	asideFolderOf,
	asideNamesOf,
	damagedLotIn,
	runningRefusalOf,
	startDefaultBrief,
	stoppedRecordOf,
} from '../../test/damaged-lot-workspace.ts'
import { deadPid } from '../../test/dead-pid.ts'
import { transitionFilesOf } from '../../test/lot-questions.ts'
import { createStartWorkspace, snapshotOf } from '../../test/lot-start-workspace.ts'
import { RUN_STARTED_AT, STOP_NOW } from '../../test/lot-stop-workspace.constants.ts'
import { stopOf, writeLiveRunMarker } from '../../test/lot-stop-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { HANDOVER_RUN_MARKER_FILE } from '../lib/handover/handover.constants.ts'
import { RECORD_DAMAGE_REASONS } from '../lib/store/store.constants.ts'
import { recheckOverlap } from './lot-start.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CommandResult } from '../lib/command-result.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

describe('two stops racing on the same damaged lot', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('the second stop runs between the first one’s read and its move -> the second moves the folder, the first says no lot, one folder aside', () => {
		const start = createStartWorkspace()
		const lot = damagedLotIn({ start, kind: 'identityMissing' })
		const before = snapshotOf(lot.lotFolder)
		let second: CommandResult | undefined
		let seenAtTheSeam: Record<string, string> | undefined

		const first = stopOf({
			cwd: start.repository,
			id: lot.name,
			reason: 'first stop',
			seams: {
				beforeMoveAside() {
					seenAtTheSeam = snapshotOf(lot.lotFolder)
					second = stopOf({ cwd: start.repository, id: lot.name, reason: 'second stop' })
				},
			},
		})

		expect(seenAtTheSeam).toEqual(before)
		expect(second?.exitCode).toBe(0)
		expect(first).toEqual({ exitCode: 2, output: `no lot ${lot.name}` })
		expect(asideNamesOf(lot)).toEqual([lot.name])
		expect(stoppedRecordOf({ folder: join(asideFolderOf(lot), lot.name) })).toMatchObject({
			reason: 'second stop',
		})
	})
})

describe('a stop while a run marker holds the damaged lot', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a live run marker -> exit 2 naming the run, nothing moved, nothing written', () => {
		const start = createStartWorkspace()
		const lot = damagedLotIn({ start, kind: 'identityMissing' })
		writeLiveRunMarker(lot.lotFolder)
		const before = snapshotOf(lot.lotFolder)

		const stopped = stopOf({ cwd: start.repository, id: lot.name })

		expect(stopped).toEqual({ exitCode: 2, output: runningRefusalOf({ folder: lot.lotFolder }) })
		expect(snapshotOf(lot.lotFolder)).toEqual(before)
		expect(asideNamesOf(lot)).toEqual([])
	})

	it('a live run marker on a lot damaged by a bad transition -> exit 2, nothing moved', () => {
		const start = createStartWorkspace()
		const lot = damagedLotIn({ start, kind: 'badTransition' })
		writeLiveRunMarker(lot.lotFolder)
		const before = snapshotOf(lot.lotFolder)

		const stopped = stopOf({ cwd: start.repository, id: lot.name })

		expect(stopped).toEqual({ exitCode: 2, output: runningRefusalOf({ folder: lot.lotFolder }) })
		expect(snapshotOf(lot.lotFolder)).toEqual(before)
		expect(asideNamesOf(lot)).toEqual([])
	})

	it('a run marker of a process that is gone -> no run holds the lot: exit 0, the folder moved aside with its marker', () => {
		const start = createStartWorkspace()
		const lot = damagedLotIn({ start, kind: 'identityMissing' })
		writeFileSync(
			join(lot.lotFolder, HANDOVER_RUN_MARKER_FILE),
			JSON.stringify({ pid: deadPid(), startedAt: RUN_STARTED_AT }),
		)

		expect(stopOf({ cwd: start.repository, id: lot.name }).exitCode).toBe(0)
		expect(asideNamesOf(lot)).toEqual([lot.name])
	})
})

describe('a start racing a stop of a damaged lot', { timeout: STORE_CASE_TIMEOUT }, () => {
	/** Last transition of a lot folder. */
	function lastTransitionOf(lotFolder: string): unknown {
		return transitionFilesOf(lotFolder).at(-1)
	}

	it('order 1: the new lot is published, the damaged lot is stopped, the new lot re-checks -> no overlap, it goes on', () => {
		const start = createStartWorkspace()
		const damaged = damagedLotIn({ start, kind: 'identityMissing' })
		const second = writeStoreLot({
			workspace: start.workspace,
			name: SECOND_NAME,
			scope: OVERLAPPING_SCOPE,
			repository: start.workspace.repository,
		})
		const stopped = stopOf({ cwd: start.repository, id: damaged.name })

		expect(stopped.exitCode).toBe(0)
		expect(recheckOverlap({ lotFolder: second, caseInsensitive: false, now: STOP_NOW })).toBe(
			undefined,
		)
		expect(lastTransitionOf(second)).toMatchObject({ seq: 1, state: 'working' })
	})

	it('order 2: the new lot is published, it re-checks, the damaged lot is stopped after -> the new lot is failed (overlap) naming the damaged one', () => {
		const start = createStartWorkspace()
		const damaged = damagedLotIn({ start, kind: 'identityMissing' })
		const second = writeStoreLot({
			workspace: start.workspace,
			name: SECOND_NAME,
			scope: OVERLAPPING_SCOPE,
			repository: start.workspace.repository,
		})

		expect(recheckOverlap({ lotFolder: second, caseInsensitive: false, now: STOP_NOW })).toBe(
			damaged.name,
		)
		expect(stopOf({ cwd: start.repository, id: damaged.name }).exitCode).toBe(0)

		expect(lastTransitionOf(second)).toMatchObject({
			seq: 2,
			state: 'failed',
			cause: {
				kind: 'overlap',
				reason: expect.stringContaining(
					`overlap with ${damaged.name} (damaged: ${damaged.reason})`,
				),
			},
		})
	})

	it('a lot that holds when the start checks and turns damaged with no readable brief before the publish -> the re-check holds every path: the new lot is failed (overlap) naming it', () => {
		const start = createStartWorkspace()
		const lotFolder = writeStoreLot({
			workspace: start.workspace,
			name: SECOND_NAME,
			scope: DISJOINT_SCOPE,
			repository: start.workspace.repository,
		})

		const started = startDefaultBrief({
			start,
			seams: {
				beforePublish() {
					rmSync(join(lotFolder, 'identity.json'))
					rmSync(join(lotFolder, 'brief.json'))
				},
			},
		})

		expect(started).toMatchObject({
			exitCode: 1,
			json: {
				state: 'failed',
				reason: expect.stringContaining(
					`overlap with ${SECOND_NAME} (damaged: ${RECORD_DAMAGE_REASONS.identityUnreadable})`,
				),
			},
		})
	})

	it('the same lot turned damaged and then stopped before the publish -> nothing left to meet: the start goes on (exit 0)', () => {
		const start = createStartWorkspace()
		const lotFolder = writeStoreLot({
			workspace: start.workspace,
			name: SECOND_NAME,
			scope: DISJOINT_SCOPE,
			repository: start.workspace.repository,
		})

		let stopped: CommandResult | undefined

		const started = startDefaultBrief({
			start,
			seams: {
				beforePublish() {
					rmSync(join(lotFolder, 'identity.json'))
					rmSync(join(lotFolder, 'brief.json'))
					stopped = stopOf({ cwd: start.repository, id: SECOND_NAME })
				},
			},
		})

		expect(stopped?.exitCode).toBe(0)
		expect(started.exitCode).toBe(0)
	})
})
