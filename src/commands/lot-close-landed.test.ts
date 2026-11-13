/**
 * `dialecte lot close` for a lot whose hand-over was committed outside its own folder: once the lot's branch is on
 * main, the lot reads `committed` and its worktree closes, the outcome naming why. Every near miss keeps the lot's
 * worktree with the reason it kept before; each runs beside a landed lot that closes, so a close that lets every lot go
 * fails the row.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { createBriefWorkspace } from '../../test/brief-workspace.ts'
import { LANDED_LOT, NEAR_MISS_LOT } from '../../test/landed-store-lot-workspace.constants.ts'
import {
	addLandedLot,
	addLotSharingWorktree,
	landedLineText,
} from '../../test/landed-store-lot-workspace.ts'
import { KEEP_NOW } from '../../test/lot-keep-workspace.constants.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { createRecordingSpawner } from '../../test/worktree-pool.ts'
import { runLotClose } from './lot-close.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BriefWorkspace } from '../../test/brief-workspace.types.ts'
import type { LandedHandover, LandedMerge } from '../../test/landed-store-lot-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** `lot close <names>` from the main checkout, `--json` unless said; the background removals recorded. */
function closing(params: { workspace: BriefWorkspace; names: string[]; json?: boolean }) {
	const { spawner } = createRecordingSpawner()
	return runLotClose({
		cwd: params.workspace.repository,
		argv: params.json === false ? params.names : [...params.names, '--json'],
		now: KEEP_NOW,
		spawner,
		listProcesses: function none() {
			return []
		},
	})
}

/** Whether the workspace's trash folder holds anything (a closed worktree waits there). */
function trashExists(workspace: BriefWorkspace): boolean {
	return existsSync(join(workspace.workspace, '.worktrees', '_trash'))
}

describe('lot close: landed lots', { timeout: STORE_CASE_TIMEOUT }, () => {
	const LANDED_ROWS: { title: string; merge: LandedMerge }[] = [
		{
			title:
				'a working lot, its hand-over committed in another folder, its branch fast-forwarded into main → closed, the worktree in the trash, the outcome naming why',
			merge: 'fast-forward',
		},
		{
			title:
				'a working lot, its hand-over committed in another folder, its branch merged into main by a merge commit → closed, the worktree in the trash, the outcome naming why',
			merge: 'merge-commit',
		},
	]
	for (const row of LANDED_ROWS)
		it(row.title, () => {
			const workspace = createBriefWorkspace()
			const lot = addLandedLot({ workspace, merge: row.merge })
			const [handover] = lot.handovers

			const result = closing({ workspace, names: [handover.name] })

			expect({
				exitCode: result.exitCode,
				outcomes: JSON.parse(result.output) as unknown,
				worktreeGone: !existsSync(lot.worktree),
				trash: trashExists(workspace),
			}).toEqual({
				exitCode: 0,
				outcomes: [
					{
						handover: handover.name,
						closed: true,
						landed: landedLineText({ lot: LANDED_LOT, folder: handover.folder, target: 'main' }),
					},
				],
				worktreeGone: true,
				trash: true,
			})
		})

	it('the same lot closed in text form → the line naming why sits under the closed line', () => {
		const workspace = createBriefWorkspace()
		const lot = addLandedLot({ workspace, merge: 'fast-forward' })
		const [handover] = lot.handovers

		const result = closing({ workspace, names: [handover.name], json: false })
		const lines = result.output.split('\n')
		const closedAt = lines.findIndex((line) => line.startsWith(`closed  ${handover.name}:`))

		expect({
			exitCode: result.exitCode,
			closedLineFound: closedAt >= 0,
			below: lines[closedAt + 1]?.trim(),
		}).toEqual({
			exitCode: 0,
			closedLineFound: true,
			below: landedLineText({ lot: LANDED_LOT, folder: handover.folder, target: 'main' }),
		})
	})

	type NearMissRow = {
		title: string
		merge: LandedMerge
		handovers: LandedHandover[]
		/** The reason the near miss shows: its lot's keep reason, or any reason (the hand-over names another worktree). */
		kept: unknown
	}
	const LOT_WORKING = `lot ${NEAR_MISS_LOT} working`
	const NEAR_MISS_ROWS: NearMissRow[] = [
		{
			title:
				'one committed and one pending hand-over elsewhere for the worktree, branch on main → kept "lot <name> working" (the lot rule answers before the pending hand-over)',
			merge: 'fast-forward',
			handovers: [{ state: 'committed' }, { state: 'pending' }],
			kept: LOT_WORKING,
		},
		{
			title:
				'a committed hand-over for the lot worktree on another branch → kept "lot <name> working"',
			merge: 'fast-forward',
			handovers: [{ state: 'committed', names: 'other-branch' }],
			kept: LOT_WORKING,
		},
		{
			title:
				'the branch not on main, its hand-over committed in another folder → kept "lot <name> working"',
			merge: 'none',
			handovers: [{ state: 'committed' }],
			kept: LOT_WORKING,
		},
	]
	for (const row of NEAR_MISS_ROWS)
		it(`${row.title}, beside a landed lot that closes`, () => {
			const workspace = createBriefWorkspace()
			const landed = addLandedLot({ workspace, merge: 'fast-forward' })
			const nearMiss = addLandedLot({
				workspace,
				name: NEAR_MISS_LOT,
				merge: row.merge,
				handovers: row.handovers,
			})
			const [closes] = landed.handovers
			const [named] = nearMiss.handovers

			const result = closing({ workspace, names: [closes.name, named.name] })

			expect({
				exitCode: result.exitCode,
				outcomes: JSON.parse(result.output) as unknown,
				landedGone: !existsSync(landed.worktree),
				nearMissStays: existsSync(nearMiss.worktree),
			}).toEqual({
				exitCode: 1,
				outcomes: [
					{
						handover: closes.name,
						closed: true,
						landed: landedLineText({ lot: LANDED_LOT, folder: closes.folder, target: 'main' }),
					},
					{ handover: named.name, kept: row.kept },
				],
				landedGone: true,
				nearMissStays: true,
			})
		})

	it('a committed hand-over for the lot worktree and a pending one for the same branch registered from another worktree, branch on main → closed, the other worktree entry ignored', () => {
		const workspace = createBriefWorkspace()
		const lot = addLandedLot({
			workspace,
			merge: 'fast-forward',
			handovers: [{ state: 'committed' }, { state: 'pending', names: 'other-worktree' }],
		})
		const [handover] = lot.handovers

		const result = closing({ workspace, names: [handover.name] })

		expect({
			exitCode: result.exitCode,
			outcomes: JSON.parse(result.output) as unknown,
			worktreeGone: !existsSync(lot.worktree),
		}).toEqual({
			exitCode: 0,
			outcomes: [
				{
					handover: handover.name,
					closed: true,
					landed: landedLineText({ lot: LANDED_LOT, folder: handover.folder, target: 'main' }),
				},
			],
			worktreeGone: true,
		})
	})

	it('two lots naming one worktree, one landed and one working → kept "lot <working> working", the outcome still carrying the line of the landed lot', () => {
		const workspace = createBriefWorkspace()
		const lot = addLandedLot({ workspace, merge: 'fast-forward' })
		addLotSharingWorktree({ workspace, lot, name: NEAR_MISS_LOT })
		const [handover] = lot.handovers

		const result = closing({ workspace, names: [handover.name] })

		expect({
			exitCode: result.exitCode,
			outcomes: JSON.parse(result.output) as unknown,
			worktreeStays: existsSync(lot.worktree),
		}).toEqual({
			exitCode: 1,
			outcomes: [
				{
					handover: handover.name,
					kept: `lot ${NEAR_MISS_LOT} working`,
					landed: landedLineText({ lot: LANDED_LOT, folder: handover.folder, target: 'main' }),
				},
			],
			worktreeStays: true,
		})
	})

	it('a landed lot whose worktree is dirty → kept for the dirty tree, the outcome still naming why, nothing moved', () => {
		const workspace = createBriefWorkspace()
		const lot = addLandedLot({ workspace, merge: 'fast-forward', dirty: true })
		const [handover] = lot.handovers

		const result = closing({ workspace, names: [handover.name] })

		expect({
			exitCode: result.exitCode,
			outcomes: JSON.parse(result.output) as unknown,
			worktreeStays: existsSync(lot.worktree),
			trash: trashExists(workspace),
		}).toEqual({
			exitCode: 1,
			outcomes: [
				{
					handover: handover.name,
					kept: expect.stringContaining('dirty:'),
					landed: landedLineText({ lot: LANDED_LOT, folder: handover.folder, target: 'main' }),
				},
			],
			worktreeStays: true,
			trash: false,
		})
	})
})
