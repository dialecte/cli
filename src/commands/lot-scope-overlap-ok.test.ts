/**
 * `lot scope <id> --add <path> --overlap-ok --by <who> --reason <text>` (FIX-overlap-ok): an add meeting an open lot is
 * written, and the overlap recorded with who accepted it and why; without the flag the add stays refused.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { writeStoreLot } from '../../test/brief-workspace.ts'
import { startRealLot } from '../../test/lot-handover-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { readLotOverlaps } from '../lib/store/lot-overlaps.ts'
import { readLotScope } from '../lib/store/lot-records.ts'
import { STORE_FILES } from '../lib/store/store.constants.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LotHandoverWorkspace } from '../../test/lot-handover-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const NOW = new Date('2026-11-17T20:00:00.000Z')
/** The open lot the add meets, and what it holds. */
const OTHER_LOT = '0009-repo-docs'
const ADDED = 'docs/setup.md'
const BY = 'person-a'
const REASON = 'separate lines in one file'

/** A started lot and an open lot holding `docs/`. */
function lotBesideDocsLot(): LotHandoverWorkspace {
	const lot = startRealLot()
	writeStoreLot({ workspace: lot.start.workspace, name: OTHER_LOT, scope: ['docs/'] })
	return lot
}

/** `lot scope <lot> --add <ADDED> --by --reason` with the extra words, from the main checkout. */
function addWith(params: { lot: LotHandoverWorkspace; extra: string[] }) {
	return runLot({
		cwd: params.lot.start.cwd,
		argv: [
			'scope',
			params.lot.lotName,
			'--add',
			ADDED,
			'--by',
			BY,
			'--reason',
			REASON,
			...params.extra,
		],
		now: NOW,
	})
}

describe('lot scope --overlap-ok', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('an add meeting an open lot, --overlap-ok → added, the overlap recorded with the lot, its met paths, who and why', () => {
		const lot = lotBesideDocsLot()

		const result = addWith({ lot, extra: ['--overlap-ok'] })

		expect(result.exitCode).toBe(0)
		expect(readLotScope({ lotFolder: lot.lotFolder })).toContain(ADDED)
		expect(readLotOverlaps({ lotFolder: lot.lotFolder })).toEqual([
			{
				schema: 1,
				at: NOW.toISOString(),
				verb: 'scope',
				lot: OTHER_LOT,
				met: [`${ADDED} meets docs`],
				by: BY,
				reason: REASON,
			},
		])
	})

	it('the same add without --overlap-ok → refused as before, nothing written', () => {
		const lot = lotBesideDocsLot()

		const result = addWith({ lot, extra: [] })

		expect(result.exitCode).toBe(2)
		expect(result.output).toContain(`the added paths meet the open lot ${OTHER_LOT}`)
		expect(readLotScope({ lotFolder: lot.lotFolder })).not.toContain(ADDED)
	})
	it('the overlap record cannot be written (overlaps.jsonl is a folder) → exit 1 naming it, the add taken back', () => {
		const lot = lotBesideDocsLot()
		mkdirSync(join(lot.lotFolder, STORE_FILES.overlaps))

		const result = addWith({ lot, extra: ['--overlap-ok'] })

		expect(result.exitCode).toBe(1)
		expect(result.output).toContain(`lot scope: ${lot.lotName}: the overlap could not be recorded:`)
		expect(readLotScope({ lotFolder: lot.lotFolder })).not.toContain(ADDED)
	})
})
