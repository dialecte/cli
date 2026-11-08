import { join } from 'node:path'

import { reachFrom } from '../../../test/import-reach.ts'
import { CASE_NAMES, FOLDER_CASE_NAMES } from '../../../test/lot-folder-cases.constants.ts'
import { buildFolderCases } from '../../../test/lot-folder-cases.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { lotFolderOf } from '../store/lot-folder.ts'
import { handoverFolderRefusal } from './worktree-state.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const WORKTREE_STATE_MODULE = join(import.meta.dirname, 'worktree-state.ts')
const LOT_FOLDER_MODULE = join(import.meta.dirname, '..', 'store', 'lot-folder.ts')

/** The one look-alike that stands outside every repository, so the rule that predates the store accepts it. */
const OUTSIDE_EVERY_REPOSITORY = CASE_NAMES.loose

describe('handoverFolderRefusal - the folder rule (D16)', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const name of FOLDER_CASE_NAMES)
		it(name, () => {
			const { cases } = buildFolderCases()
			const row = cases.find((candidate) => candidate.name === name)!
			const accepted = row.lot !== undefined || row.name === OUTSIDE_EVERY_REPOSITORY

			// the lot-folder decision first: it is what separates a lot from the rest, and these rows pin both
			expect({
				lot: lotFolderOf({ folder: row.folder }),
				refusal: handoverFolderRefusal(row.folder),
			}).toEqual({
				lot: row.lot,
				refusal: accepted ? undefined : expect.stringContaining(row.folder),
			})
		})

	it('a lot folder, direct and through .dialecte/lot, with PATH emptied -> accepted without running git', () => {
		const { cases } = buildFolderCases()
		const lots = cases.filter((row) => row.lot !== undefined)
		vi.stubEnv('PATH', '')

		expect(
			lots.map((row) => ({
				name: row.name,
				lot: lotFolderOf({ folder: row.folder }),
				refusal: handoverFolderRefusal(row.folder),
			})),
		).toEqual(lots.map((row) => ({ name: row.name, lot: row.lot, refusal: undefined })))
	})

	it('the rule reaches the git-free lot-folder module, and decides the lot folder there (no restated decision)', () => {
		const { layout } = buildFolderCases()

		expect({
			reachesLotFolder: reachFrom(WORKTREE_STATE_MODULE).files.includes(LOT_FOLDER_MODULE),
			lot: lotFolderOf({ folder: layout.lotFolder }),
		}).toEqual({ reachesLotFolder: true, lot: layout.lotFolder })
	})
})
