/**
 * R1-B3: a damaged lot whose identity reads still names its worktree: `worktree prune` and `lot close` keep that
 * worktree (the keep rule), whatever the lot's other records say.
 */
import { existsSync, realpathSync } from 'node:fs'

import { createBriefWorkspace } from '../../test/brief-workspace.ts'
import { KEEP_NOW, REMOVABLE } from '../../test/lot-keep-workspace.constants.ts'
import { addLotWorktree, worktreeFatesOf } from '../../test/lot-keep-workspace.ts'
import { snapshotOf } from '../../test/lot-start-workspace.ts'
import { temporaryFolder } from '../../test/scratch-repository.ts'
import { RECORD_TIME } from '../../test/store-records.constants.ts'
import { writeRecordFile } from '../../test/store-records.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { createRecordingSpawner } from '../../test/worktree-pool.ts'
import {
	handoverStoreOf,
	recordHandoverState,
	registerHandover,
} from '../lib/handover/handover-store.ts'
import { runLotClose } from './lot-close.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BriefWorkspace } from '../../test/brief-workspace.types.ts'
import type { LotWorktree } from '../../test/lot-keep-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const DAMAGED_LOT = '0001-repo-damaged'

/** A working lot with its worktree whose records are then damaged by a stray answer; its identity still reads. */
function damagedWorkingLot(workspace: BriefWorkspace): LotWorktree {
	const lot = addLotWorktree({ workspace, name: DAMAGED_LOT, state: 'working' })
	writeRecordFile({
		folder: lot.lotFolder,
		name: 'answers/zz.json',
		text: JSON.stringify({ question: 'zz', answer: 'keep', by: 'caller', at: RECORD_TIME }),
	})
	return lot
}

/** A hand-over of the lot's worktree, registered through the store's own writer and committed; its registry name. */
function registerCommitted(params: { workspace: BriefWorkspace; lot: LotWorktree }): string {
	const folder = realpathSync(temporaryFolder('dialecte-handover-'))
	const name = registerHandover({
		root: params.lot.worktree,
		folder,
		branch: params.lot.branch,
		now: KEEP_NOW,
	})
	recordHandoverState({
		store: handoverStoreOf(params.workspace.repository),
		folder,
		state: 'committed',
	})
	return name
}

describe('the keep rule and a damaged lot', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('worktree prune, a merged clean worktree named by a damaged lot whose identity reads -> kept, not listed for removal', async () => {
		const workspace = createBriefWorkspace()
		damagedWorkingLot(workspace)

		const fates = await worktreeFatesOf(workspace)

		expect(fates[DAMAGED_LOT]).toBeDefined()
		expect(fates[DAMAGED_LOT]).not.toBe(REMOVABLE)
	})

	it('lot close of a committed hand-over whose worktree a damaged lot names -> kept, nothing moved, the worktree stays', () => {
		const workspace = createBriefWorkspace()
		const lot = damagedWorkingLot(workspace)
		const handover = registerCommitted({ workspace, lot })
		const before = snapshotOf(lot.lotFolder)
		const { spawner, calls } = createRecordingSpawner()

		const result = runLotClose({
			cwd: workspace.repository,
			argv: [handover, '--json'],
			now: KEEP_NOW,
			spawner,
			listProcesses: function none() {
				return []
			},
		})

		expect(result.exitCode).toBe(1)
		expect(JSON.parse(result.output)).toEqual([
			{ handover, kept: expect.stringContaining(DAMAGED_LOT) },
		])
		expect(calls).toEqual([])
		expect(existsSync(lot.worktree)).toBe(true)
		expect(snapshotOf(lot.lotFolder)).toEqual(before)
	})
})
