/**
 * R1-B2: `handover write --out <damaged lot>` is refused naming the damage and `lot stop`, whatever else the lot
 * would say; `lot stop` of a damaged lot a pending hand-over names is refused naming `handover abandon` first.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { DAMAGES } from '../../test/damaged-lot-workspace.constants.ts'
import { asideNamesOf, damagedLotIn } from '../../test/damaged-lot-workspace.ts'
import { STORE_WRITER_CLI } from '../../test/handover-store-scenario.constants.ts'
import { writeLotsFile } from '../../test/handover-store-scenario.ts'
import { MAIN_CHANGES } from '../../test/lot-handover-workspace.constants.ts'
import { isolateStateFolder } from '../../test/lot-handover-workspace.ts'
import { createStartWorkspace, snapshotOf } from '../../test/lot-start-workspace.ts'
import { stopOf } from '../../test/lot-stop-workspace.ts'
import { noRepositoryCli } from '../../test/repository-cli-probe.ts'
import { writeFiles } from '../../test/scratch-repository.ts'
import { entryOf, writeRecordFile } from '../../test/store-records.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { COMMIT_SCRIPT_FILE } from '../lib/handover/handover.constants.ts'
import {
	ABANDON_COMMAND,
	READABLE_IDENTITY_DAMAGES,
	STOP_COMMAND,
} from './handover-write-damaged-lot.constants.ts'
import { runHandover } from './handover.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

describe('handover write into a damaged lot folder', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of DAMAGES.filter((each) => READABLE_IDENTITY_DAMAGES.includes(each.kind)))
		it(`${row.title} -> exit 2 naming the damage and lot stop, nothing written into the folder`, () => {
			isolateStateFolder()
			const start = createStartWorkspace()
			const lot = damagedLotIn({ start, kind: row.kind })
			writeFiles({ root: start.repository, files: { ...MAIN_CHANGES } })
			const lotsPath = writeLotsFile({ root: start.repository, name: 'damaged' })
			const folderBefore = snapshotOf(lot.lotFolder)

			const result = runHandover({
				argv: [lotsPath, '--out', lot.lotFolder],
				cliPath: STORE_WRITER_CLI,
				probe: noRepositoryCli,
				cwd: start.repository,
			})

			expect(result.exitCode).toBe(2)
			expect(result.output).toContain(lot.reason)
			expect(result.output).toContain(STOP_COMMAND)
			expect(snapshotOf(lot.lotFolder)).toEqual(folderBefore)
			expect(existsSync(join(lot.lotFolder, COMMIT_SCRIPT_FILE))).toBe(false)
		})
})

describe(
	'lot stop of a damaged lot a pending hand-over names',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('a pending registry entry names the folder -> exit 2 naming handover abandon first, the folder not moved', () => {
			const start = createStartWorkspace()
			const lot = damagedLotIn({ start, kind: 'badTransition' })
			writeRecordFile({
				folder: start.workspace.registry,
				name: `${lot.name}.json`,
				text: JSON.stringify(entryOf({ state: 'pending', folder: lot.lotFolder })),
			})
			const folderBefore = snapshotOf(lot.lotFolder)

			const stopped = stopOf({ cwd: start.repository, id: lot.name })

			expect(stopped.exitCode).toBe(2)
			expect(stopped.output).toContain(ABANDON_COMMAND)
			expect(snapshotOf(lot.lotFolder)).toEqual(folderBefore)
			expect(asideNamesOf(lot)).toEqual([])
		})
	},
)
