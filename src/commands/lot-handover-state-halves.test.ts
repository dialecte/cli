/** The state halves of cases 43, 59 and 62: records written by hand, `lot status` reads and never writes. */
import { commitLotByHand, runIn } from '../../test/handover-store-scenario.ts'
import { LOT_CHANGES } from '../../test/lot-handover-workspace.constants.ts'
import {
	bytesOf,
	registeredFolders,
	startRealLot,
	statusOf,
	withStdoutJson,
	writeInto,
	writeLotHandover,
	writeTransition,
} from '../../test/lot-handover-workspace.ts'
import { otherLivePid } from '../../test/other-live-pid.ts'
import { LATER_TIME, RECORD_TIME } from '../../test/store-records.constants.ts'
import { entryOf, transitionOf, writeRecordFile } from '../../test/store-records.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { HANDOVER_FILES, HANDOVER_RUN_MARKER_FILE } from '../lib/handover/handover.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LotHandoverWorkspace } from '../../test/lot-handover-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const ENTRY_NAME = '2026-11-08-feat-dataflow-subscribe'

/** A registry entry `pending` for the lot folder, written by hand. */
function writePendingEntry(lot: LotHandoverWorkspace): void {
	writeRecordFile({
		folder: lot.start.workspace.registry,
		name: `${ENTRY_NAME}.json`,
		text: JSON.stringify(entryOf({ state: 'pending', folder: lot.lotFolder })),
	})
}

describe(
	'lot status, the registry and the markers by hand',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('registry pending, the lots committed by hand in git (case 43) -> ready, nothing written', () => {
			const lot = startRealLot()
			writePendingEntry(lot)
			commitLotByHand({
				root: lot.worktree,
				paths: Object.keys(LOT_CHANGES),
				message: 'feat(dataflow): subscribe',
			})
			const before = bytesOf(lot)

			expect(statusOf({ lot, argument: lot.lotName })).toMatchObject({
				exitCode: 0,
				json: { state: 'ready', handover: { name: ENTRY_NAME, state: 'pending' } },
			})
			expect(bytesOf(lot)).toEqual(before)
		})

		it('a canceled transition and a registry entry pending, both by hand (case 59) -> canceled', () => {
			const lot = startRealLot()
			writePendingEntry(lot)
			writeTransition({
				lotFolder: lot.lotFolder,
				transition: transitionOf({ seq: 2, state: 'canceled', kind: 'stop', at: LATER_TIME }),
			})

			expect(statusOf({ lot, argument: lot.lotName })).toMatchObject({
				exitCode: 0,
				json: { state: 'canceled', handover: { name: ENTRY_NAME, state: 'pending' } },
			})
		})

		it('abandoned.json and a run marker of a live process (case 62) -> not canceled: the run is about to take the abandon back', () => {
			const lot = startRealLot()
			writePendingEntry(lot)
			writeRecordFile({
				folder: lot.lotFolder,
				name: HANDOVER_FILES.abandoned,
				text: `${JSON.stringify({ at: RECORD_TIME })}\n`,
			})
			writeRecordFile({
				folder: lot.lotFolder,
				name: HANDOVER_RUN_MARKER_FILE,
				text: JSON.stringify({ pid: otherLivePid(), startedAt: RECORD_TIME }),
			})

			expect(statusOf({ lot, argument: lot.lotName })).toMatchObject({
				exitCode: 0,
				json: { state: 'ready' },
			})
		})

		it('abandoned.json and no run marker (case 62) -> canceled', () => {
			const lot = startRealLot()
			writePendingEntry(lot)
			writeRecordFile({
				folder: lot.lotFolder,
				name: HANDOVER_FILES.abandoned,
				text: `${JSON.stringify({ at: RECORD_TIME })}\n`,
			})

			expect(statusOf({ lot, argument: lot.lotName })).toMatchObject({
				exitCode: 0,
				json: { state: 'canceled' },
			})
		})
	},
)

describe(
	'handover write --out the real path of a lot folder',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('--out the real path of the lot folder -> written there as for any folder: the JSON and the registry name it', () => {
			const lot = startRealLot()

			expect(
				withStdoutJson(
					writeInto({
						lotsPath: lot.lotsPath,
						out: lot.lotFolder,
						cwd: lot.worktree,
						extra: ['--json'],
					}),
				),
			).toMatchObject({ exitCode: 0, json: { folder: lot.lotFolder } })
			expect(registeredFolders(lot)).toEqual([lot.lotFolder])
		})
	},
)

describe('handover run on a ready lot folder', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a lot ready by its written hand-over -> not refused by the canceled rule: exit 0', async () => {
		const lot = startRealLot()
		writeLotHandover(lot)

		const outcome = await runIn({ cwd: lot.worktree, argv: [lot.lotFolder] })

		expect(outcome).toMatchObject({ exitCode: 0 })
	})
})
