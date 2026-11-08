import { join } from 'node:path'

import { reachFrom } from '../../../test/import-reach.ts'
import { FOLDER_CASE_NAMES } from '../../../test/lot-folder-cases.constants.ts'
import { buildFolderCases } from '../../../test/lot-folder-cases.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { lotFolderOf } from './lot-folder.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const LOT_FOLDER_MODULE = join(import.meta.dirname, 'lot-folder.ts')

describe(
	'lotFolderOf - decided from the path and the entries',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		for (const name of FOLDER_CASE_NAMES)
			it(name, () => {
				const { cases } = buildFolderCases()
				const row = cases.find((candidate) => candidate.name === name)!

				expect(lotFolderOf({ folder: row.folder })).toBe(row.lot)
			})

		it('every case, with PATH emptied (no git to run) -> the same answers', () => {
			const { cases } = buildFolderCases()
			vi.stubEnv('PATH', '')

			expect(
				cases.map((row) => ({ name: row.name, lot: lotFolderOf({ folder: row.folder }) })),
			).toEqual(cases.map((row) => ({ name: row.name, lot: row.lot })))
		})

		it('the module and what it imports -> no node:child_process, and it finds a real lot', () => {
			const { layout } = buildFolderCases()

			expect({
				childProcessImporters: reachFrom(LOT_FOLDER_MODULE).childProcessImporters,
				lot: lotFolderOf({ folder: layout.lotFolder }),
			}).toEqual({ childProcessImporters: [], lot: layout.lotFolder })
		})
	},
)
