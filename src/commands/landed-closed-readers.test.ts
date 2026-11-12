/**
 * The git-free readers of a lot whose hand-over was committed outside its folder and then closed by `lot close`: with
 * the picked entry `closed` the lot reads committed everywhere, with no probe and whatever became of its branch. A lot
 * resumed after its hand-over, or running now, reads from its own records. Every case here uses a branch that is not
 * merged, so the probe could not be what decides.
 */
import { existsSync } from 'node:fs'

import { createBriefWorkspace } from '../../test/brief-workspace.ts'
import { LANDED_SCOPE_FILE } from '../../test/landed-store-lot-plan.constants.ts'
import { createLandedPlanWorkspace, planViewOf } from '../../test/landed-store-lot-plan.ts'
import { LANDED_LOT } from '../../test/landed-store-lot-workspace.constants.ts'
import { addLandedLot } from '../../test/landed-store-lot-workspace.ts'
import { KEEP_NOW } from '../../test/lot-keep-workspace.constants.ts'
import { createWaitTime, waitJson } from '../../test/simulated-lot.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { createRecordingSpawner } from '../../test/worktree-pool.ts'
import { overlappingOpenLots } from '../lib/store/lot-records.ts'
import { runLotClose } from './lot-close.ts'
import { lotStatus } from './lot-status.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BriefWorkspace } from '../../test/brief-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The state `lot status <lot> --json` reports from the workspace's main checkout. */
function statusOf(workspace: BriefWorkspace): unknown {
	const { output } = lotStatus({ cwd: workspace.repository, argv: [LANDED_LOT, '--json'] })
	return (JSON.parse(output) as { state: unknown }).state
}

/** The names of the open lots a scope of `src/` meets, as `lot start` reads them. */
function overlapNamesOf(workspace: BriefWorkspace): string[] {
	return overlappingOpenLots({
		store: workspace.store,
		registry: workspace.registry,
		scope: ['src/'],
		caseInsensitive: false,
	}).map((overlap) => overlap.name)
}

describe('the readers of a closed hand-over, no probe', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('the picked entry closed, the branch not merged → lot status says committed', () => {
		const workspace = createBriefWorkspace()
		addLandedLot({ workspace, merge: 'none', closed: true })

		expect(statusOf(workspace)).toBe('committed')
	})

	it('the picked entry closed, the branch not merged → the overlap at lot start does not meet the lot', () => {
		const workspace = createBriefWorkspace()
		addLandedLot({ workspace, merge: 'none', closed: true })

		expect(overlapNamesOf(workspace)).toEqual([])
	})

	it('the picked entry closed, the branch not merged → plan next has the lot not open and the entry proposed', () => {
		const { workspace, plan } = createLandedPlanWorkspace()
		addLandedLot({ workspace, merge: 'none', closed: true, scope: [LANDED_SCOPE_FILE] })

		expect(planViewOf({ plan, lot: LANDED_LOT })).toEqual({
			proposed: true,
			held: false,
			lotMentionedUnder: [],
		})
	})

	it('the picked entry closed, the branch not merged → lot wait exits 0 on committed', async () => {
		const workspace = createBriefWorkspace()
		addLandedLot({ workspace, merge: 'none', closed: true })

		const result = await waitJson({
			cwd: workspace.repository,
			id: LANDED_LOT,
			time: createWaitTime(),
			words: ['--timeout', '5'],
		})

		expect({
			exitCode: result.exitCode,
			state: (result.json as { state: unknown }).state,
		}).toEqual({ exitCode: 0, state: 'committed' })
	})

	it('the same lot with the entry not closed, the branch not merged → status working and the overlap meets it', () => {
		const workspace = createBriefWorkspace()
		addLandedLot({ workspace, merge: 'none' })

		expect({ status: statusOf(workspace), overlap: overlapNamesOf(workspace) }).toEqual({
			status: 'working',
			overlap: [LANDED_LOT],
		})
	})
})

describe('a lot resumed after its hand-over, or running', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('landed, a working transition later than the hand-over → lot close keeps it "lot <name> working"', () => {
		const workspace = createBriefWorkspace()
		const lot = addLandedLot({ workspace, merge: 'fast-forward', resumed: true })
		const { spawner } = createRecordingSpawner()

		const result = runLotClose({
			cwd: workspace.repository,
			argv: [lot.handovers[0].name, '--json'],
			now: KEEP_NOW,
			spawner,
			listProcesses: function none() {
				return []
			},
		})

		expect({
			exitCode: result.exitCode,
			outcomes: JSON.parse(result.output) as unknown,
			worktreeStays: existsSync(lot.worktree),
		}).toMatchObject({
			exitCode: 1,
			outcomes: [{ handover: lot.handovers[0].name, kept: `lot ${LANDED_LOT} working` }],
			worktreeStays: true,
		})
	})

	it('landed, a working transition later than the hand-over → plan next counts the lot open and holds the entry', () => {
		const { workspace, plan } = createLandedPlanWorkspace()
		addLandedLot({ workspace, merge: 'fast-forward', resumed: true, scope: [LANDED_SCOPE_FILE] })

		const view = planViewOf({ plan, lot: LANDED_LOT })

		expect({
			proposed: view.proposed,
			held: view.held,
			open: view.lotMentionedUnder.includes('open'),
		}).toEqual({
			proposed: false,
			held: true,
			open: true,
		})
	})

	it('the picked entry closed, a working transition later than the hand-over → lot status says working', () => {
		const workspace = createBriefWorkspace()
		addLandedLot({ workspace, merge: 'none', closed: true, resumed: true })

		expect(statusOf(workspace)).toBe('working')
	})
})
