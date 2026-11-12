/**
 * `dialecte lot close`: the keep rule of the lot store (33S section 11). A worktree that a lot of the repository's
 * store names while the lot is not `committed` nor `canceled` is kept, with the reason `lot <full name> <state>`,
 * checked before the other keep rules, though the hand-over registered for that worktree is committed; nothing moves.
 * A lot `canceled` keeps nothing: a keep rule only ever keeps.
 */
import { existsSync, realpathSync } from 'node:fs'
import { join } from 'node:path'

import { createBriefWorkspace } from '../../test/brief-workspace.ts'
import { writeHookRecordAtHead } from '../../test/lot-close-final-record.ts'
import { KEEP_NOW } from '../../test/lot-keep-workspace.constants.ts'
import { addLotWorktree } from '../../test/lot-keep-workspace.ts'
import { snapshotOf } from '../../test/lot-start-workspace.ts'
import { git, temporaryFolder } from '../../test/scratch-repository.ts'
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
import type { LotKeepState, LotWorktree } from '../../test/lot-keep-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const WORKING_LOT = '0001-repo-working'
const CANCELED_LOT = '0002-repo-stopped'

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
	writeHookRecordAtHead(params.lot.worktree)
	return name
}

/** `lot close <names> --json` from the main checkout, the background removals recorded. */
function closing(params: { workspace: BriefWorkspace; names: string[] }) {
	const { spawner, calls } = createRecordingSpawner()
	const result = runLotClose({
		cwd: params.workspace.repository,
		argv: [...params.names, '--json'],
		now: KEEP_NOW,
		spawner,
		listProcesses: function none() {
			return []
		},
	})
	return {
		exitCode: result.exitCode,
		outcomes: JSON.parse(result.output) as unknown,
		calls,
	}
}

/** Everything a kept close must leave alone, as bytes: the lot folder, the registry, the worktree list. */
function untouchedBy(params: { workspace: BriefWorkspace; lot: LotWorktree }) {
	return {
		lot: snapshotOf(params.lot.lotFolder),
		registry: snapshotOf(params.workspace.registry),
		worktrees: git({
			root: params.workspace.repository,
			args: ['worktree', 'list', '--porcelain'],
		}),
	}
}

describe('lot close: the lot keep rule', { timeout: STORE_CASE_TIMEOUT }, () => {
	const OPEN_STATES: LotKeepState[] = ['working', 'input-required']
	for (const state of OPEN_STATES)
		it(`a committed hand-over whose worktree a lot ${state} names → kept, reason "lot <name> ${state}", nothing moved, exit 1 (case 23)`, () => {
			const workspace = createBriefWorkspace()
			const lot = addLotWorktree({ workspace, name: WORKING_LOT, state })
			const handover = registerCommitted({ workspace, lot })
			const before = untouchedBy({ workspace, lot })

			const closed = closing({ workspace, names: [handover] })

			expect({
				...closed,
				bytes: untouchedBy({ workspace, lot }),
				worktreeStays: existsSync(lot.worktree),
				trash: existsSync(join(workspace.workspace, '.worktrees', '_trash')),
			}).toEqual({
				exitCode: 1,
				outcomes: [{ handover, kept: `lot ${WORKING_LOT} ${state}` }],
				calls: [],
				bytes: before,
				worktreeStays: true,
				trash: false,
			})
		})

	it('the same worktree dirty (an untracked file) → the reason shown is the lot, not the dirty tree', () => {
		const workspace = createBriefWorkspace()
		const lot = addLotWorktree({ workspace, name: WORKING_LOT, state: 'working', dirty: true })
		const handover = registerCommitted({ workspace, lot })

		expect(closing({ workspace, names: [handover] })).toMatchObject({
			exitCode: 1,
			outcomes: [{ handover, kept: `lot ${WORKING_LOT} working` }],
			calls: [],
		})
	})

	it('two committed hand-overs, one worktree named by a working lot and one by a canceled lot → the first kept, the second closed', () => {
		const workspace = createBriefWorkspace()
		const working = addLotWorktree({ workspace, name: WORKING_LOT, state: 'working' })
		const canceled = addLotWorktree({ workspace, name: CANCELED_LOT, state: 'canceled' })
		const keptHandover = registerCommitted({ workspace, lot: working })
		const closedHandover = registerCommitted({ workspace, lot: canceled })

		const closed = closing({ workspace, names: [keptHandover, closedHandover] })

		expect({
			exitCode: closed.exitCode,
			outcomes: closed.outcomes,
			keptStays: existsSync(working.worktree),
			closedGone: !existsSync(canceled.worktree),
		}).toEqual({
			exitCode: 1,
			outcomes: [
				{ handover: keptHandover, kept: `lot ${WORKING_LOT} working` },
				{ handover: closedHandover, closed: true },
			],
			keptStays: true,
			closedGone: true,
		})
	})
})
