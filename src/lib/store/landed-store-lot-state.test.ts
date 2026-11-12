/**
 * `readLandedLotState` over a real store lot and a real worktree: with the probe, a lot whose hand-over was committed
 * outside its folder and whose branch is on main reads `committed`; every other reading, and the git-free readers, stay
 * as the lot's own records say.
 */
import { createBriefWorkspace, writeStoreLot } from '../../../test/brief-workspace.ts'
import { replaceRecord } from '../../../test/damaged-lot-workspace.ts'
import {
	LANDED_CLOSED_AT,
	LANDED_LOT,
	LANDED_WRITTEN,
} from '../../../test/landed-store-lot-workspace.constants.ts'
import {
	addLandedLot,
	clearIdentityWorktree,
	damageEntryWritten,
	deleteLotBranch,
} from '../../../test/landed-store-lot-workspace.ts'
import { RECORD_TIME } from '../../../test/store-records.constants.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { lotStatus } from '../../commands/lot-status.ts'
import { handoverStoreOf, recordHandoverClosed } from '../handover/handover-store.ts'
import { createLandedProbe, readLandedLotState } from './lot-entry.ts'
import { readCheckedLotState } from './lot-records.ts'
import { lotState } from './lot-state.ts'
import { RECORD_DAMAGE_REASONS } from './store.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LandedHandover } from '../../../test/landed-store-lot-workspace.types.ts'
import type { LandedLotState } from './lot-entry.types.ts'
import type { CheckedLotState } from './store.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** What a reading says: the state of its records (with since) or why it is damaged, and the landed reading by what names it. */
function viewOf(result: CheckedLotState | LandedLotState | undefined) {
	if (result === undefined) return 'nothing at the folder'
	const { landed } = result as LandedLotState
	return {
		...('input' in result
			? { state: lotState(result.input).state, since: lotState(result.input).since }
			: { damage: result.damage }),
		landed: landed && { entry: landed.entry.name, folder: landed.folder, target: landed.target },
	}
}

/** The state `lot status <name> --json` reports from the workspace's main checkout. */
function reportedStateOf(params: { cwd: string; name: string }): unknown {
	const { output } = lotStatus({ cwd: params.cwd, argv: [params.name, '--json'] })
	return (JSON.parse(output) as { state: unknown }).state
}

/** The state of a reading and whether it carries a landed reading. */
function stateAndLandedOf(result: LandedLotState | undefined) {
	return {
		state: result && 'input' in result ? lotState(result.input).state : 'no input',
		landed: result?.landed,
	}
}

/** A probe that fails the case when it runs. */
function probeThatMustNotRun(): never {
	throw new Error('the probe ran')
}

describe('readLandedLotState: landed lots', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a working lot, its hand-over committed in another folder, its branch fast-forwarded into main, read with the probe → committed since the entry was written and landed on main, while the git-free readers still say working', () => {
		const workspace = createBriefWorkspace()
		const lot = addLandedLot({ workspace, merge: 'fast-forward' })
		const read = { lotFolder: lot.lotFolder, registry: workspace.registry }

		expect({
			withProbe: viewOf(
				readLandedLotState({
					...read,
					probe: createLandedProbe({ root: workspace.repository, packageJson: {} }),
				}),
			),
			checked: viewOf(readCheckedLotState(read)),
			status: reportedStateOf({ cwd: workspace.repository, name: LANDED_LOT }),
		}).toEqual({
			withProbe: {
				state: 'committed',
				since: LANDED_WRITTEN.toISOString(),
				landed: { entry: lot.handovers[0].name, folder: lot.handovers[0].folder, target: 'main' },
			},
			checked: { state: 'working', since: RECORD_TIME, landed: undefined },
			status: 'working',
		})
	})

	it('the same lot read without the probe → working, no landed reading', () => {
		const workspace = createBriefWorkspace()
		const lot = addLandedLot({ workspace, merge: 'fast-forward' })

		expect(
			viewOf(readLandedLotState({ lotFolder: lot.lotFolder, registry: workspace.registry })),
		).toEqual({ state: 'working', since: RECORD_TIME, landed: undefined })
	})

	it('a working lot whose branch is not on main, read with the probe → working, no landed reading', () => {
		const workspace = createBriefWorkspace()
		const lot = addLandedLot({ workspace, merge: 'none' })

		expect(
			viewOf(
				readLandedLotState({
					lotFolder: lot.lotFolder,
					registry: workspace.registry,
					probe: createLandedProbe({ root: workspace.repository, packageJson: {} }),
				}),
			),
		).toEqual({ state: 'working', since: RECORD_TIME, landed: undefined })
	})

	it('a lot whose own folder is registered committed, read with the probe → committed by that entry, no landed reading', () => {
		const workspace = createBriefWorkspace()
		const lotFolder = writeStoreLot({
			workspace,
			name: LANDED_LOT,
			scope: ['src/'],
			registry: 'committed',
		})

		expect(
			viewOf(
				readLandedLotState({
					lotFolder,
					registry: workspace.registry,
					probe: createLandedProbe({ root: workspace.repository, packageJson: {} }),
				}),
			),
		).toEqual({ state: 'committed', since: RECORD_TIME, landed: undefined })
	})

	it('a lot whose own folder is registered pending beside a committed hand-over elsewhere, branch on main, read with the probe → ready by the folder entry, no landed reading', () => {
		const workspace = createBriefWorkspace()
		const lot = addLandedLot({ workspace, merge: 'fast-forward', registry: 'pending' })

		expect(
			viewOf(
				readLandedLotState({
					lotFolder: lot.lotFolder,
					registry: workspace.registry,
					probe: createLandedProbe({ root: workspace.repository, packageJson: {} }),
				}),
			),
		).toEqual({ state: 'ready', since: RECORD_TIME, landed: undefined })
	})

	it('a lot whose identity does not read, read with the probe → the damage, no landed reading', () => {
		const workspace = createBriefWorkspace()
		const lotFolder = writeStoreLot({ workspace, name: LANDED_LOT, scope: ['src/'] })
		replaceRecord({ folder: lotFolder, name: 'identity.json', text: 'not json' })

		expect(
			viewOf(
				readLandedLotState({
					lotFolder,
					registry: workspace.registry,
					probe: createLandedProbe({ root: workspace.repository, packageJson: {} }),
				}),
			),
		).toEqual({ damage: RECORD_DAMAGE_REASONS.identityUnreadable, landed: undefined })
	})

	it('a landed lot whose picked entry is closed and whose branch was deleted afterwards, read with a probe that records its calls → committed, no probe call, no landed reading', () => {
		const workspace = createBriefWorkspace()
		const lot = addLandedLot({ workspace, merge: 'fast-forward' })
		recordHandoverClosed({
			store: handoverStoreOf(workspace.repository),
			name: lot.handovers[0].name,
			at: LANDED_CLOSED_AT,
		})
		deleteLotBranch({ workspace, branch: lot.branch })
		let probeCalls = 0
		function countingProbe(): undefined {
			probeCalls += 1
			return undefined
		}

		expect({
			...stateAndLandedOf(
				readLandedLotState({
					lotFolder: lot.lotFolder,
					registry: workspace.registry,
					probe: countingProbe,
				}),
			),
			probeCalls,
		}).toEqual({ state: 'committed', landed: undefined, probeCalls: 0 })
	})

	it('a landed lot whose entry is not closed and whose branch was deleted, read with the probe → working, no landed reading', () => {
		const workspace = createBriefWorkspace()
		const lot = addLandedLot({ workspace, merge: 'fast-forward' })
		deleteLotBranch({ workspace, branch: lot.branch })

		expect(
			stateAndLandedOf(
				readLandedLotState({
					lotFolder: lot.lotFolder,
					registry: workspace.registry,
					probe: createLandedProbe({ root: workspace.repository, packageJson: {} }),
				}),
			),
		).toEqual({ state: 'working', landed: undefined })
	})

	it('a lot whose picked committed entry has a damaged written time, branch on main, read with the probe → working, no landed reading', () => {
		const workspace = createBriefWorkspace()
		const lot = addLandedLot({ workspace, merge: 'fast-forward' })
		damageEntryWritten({ workspace, name: lot.handovers[0].name })

		expect(
			stateAndLandedOf(
				readLandedLotState({
					lotFolder: lot.lotFolder,
					registry: workspace.registry,
					probe: createLandedProbe({ root: workspace.repository, packageJson: {} }),
				}),
			),
		).toEqual({ state: 'working', landed: undefined })
	})

	it('a lot whose identity names no worktree, a committed hand-over elsewhere, branch on main, read with a probe that throws → working, the probe never runs', () => {
		const workspace = createBriefWorkspace()
		const lot = addLandedLot({ workspace, merge: 'fast-forward' })
		clearIdentityWorktree(lot.lotFolder)

		expect(
			stateAndLandedOf(
				readLandedLotState({
					lotFolder: lot.lotFolder,
					registry: workspace.registry,
					probe: probeThatMustNotRun,
				}),
			),
		).toEqual({ state: 'working', landed: undefined })
	})

	it('a landed lot with a live run marker on its folder, read with the probe → working, no landed reading', () => {
		const workspace = createBriefWorkspace()
		const lot = addLandedLot({ workspace, merge: 'fast-forward', liveRun: true })

		expect(
			stateAndLandedOf(
				readLandedLotState({
					lotFolder: lot.lotFolder,
					registry: workspace.registry,
					probe: createLandedProbe({ root: workspace.repository, packageJson: {} }),
				}),
			),
		).toEqual({ state: 'working', landed: undefined })
	})

	const NO_PROBE_ROWS: { title: string; handovers: LandedHandover[] }[] = [
		{ title: 'no hand-over elsewhere', handovers: [] },
		{ title: 'only a pending hand-over elsewhere', handovers: [{ state: 'pending' }] },
	]
	for (const row of NO_PROBE_ROWS)
		it(`a working lot with ${row.title}, branch on main, read with a probe that throws → working, the probe never runs`, () => {
			const workspace = createBriefWorkspace()
			const lot = addLandedLot({ workspace, merge: 'fast-forward', handovers: row.handovers })

			expect(
				viewOf(
					readLandedLotState({
						lotFolder: lot.lotFolder,
						registry: workspace.registry,
						probe: probeThatMustNotRun,
					}),
				),
			).toEqual({ state: 'working', since: RECORD_TIME, landed: undefined })
		})
})
