import { installTestDialecte } from '../../../../test/installed-test-dialecte.ts'
import {
	environmentWithCacheInWorkTree,
	filesKeyOfFolder,
	foldersOfIds,
	holdingAll,
} from '../../../../test/standard-selection-fixtures.ts'
import {
	DECLARED_FOLDER,
	OTHER_FOLDERS,
	UNKNOWN_FOLDER,
} from '../../../../test/standard-selection.constants.ts'
import { createStandardWorkspace, entriesOf } from '../../../../test/standard-workspace.ts'
import { STANDARD_DISK_CASE_TIMEOUT } from '../../../../test/test-timing.constants.ts'
import { loadStandardIndexes } from './load-standard-indexes.ts'

import { describe, expect, it } from 'vitest'

describe('loadStandardIndexes: the indexes of the selected folders over a temporary root and cache (D2)', () => {
	it(
		'one folder -> loaded: its search index with the installed vocabulary, its id and files key',
		async () => {
			const workspace = createStandardWorkspace({
				standards: foldersOfIds({ ids: [DECLARED_FOLDER, ...OTHER_FOLDERS] }),
			})
			installTestDialecte({ cwd: workspace.cwd })

			await expect(
				loadStandardIndexes({
					cwd: workspace.cwd,
					environment: workspace.environment,
					standardIds: [DECLARED_FOLDER],
				}),
			).resolves.toMatchObject({
				kind: 'loaded',
				standard: {
					kind: 'documents',
					folders: [
						{
							id: DECLARED_FOLDER,
							files: filesKeyOfFolder({
								environment: workspace.environment,
								standardId: DECLARED_FOLDER,
							}),
						},
					],
					indexes: [
						{
							files: [{ fileId: `${DECLARED_FOLDER}/one` }],
							vocabulary: { tags: expect.arrayContaining(['A', 'AA_1']) },
						},
					],
				},
			})
			expect(entriesOf(workspace.cache)).not.toEqual([])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'two folders -> loaded: one index and one files key per folder, in id order',
		async () => {
			const workspace = createStandardWorkspace({
				standards: foldersOfIds({ ids: [DECLARED_FOLDER, ...OTHER_FOLDERS] }),
			})
			installTestDialecte({ cwd: workspace.cwd })

			await expect(
				loadStandardIndexes({
					cwd: workspace.cwd,
					environment: workspace.environment,
					standardIds: [OTHER_FOLDERS[0], DECLARED_FOLDER],
				}),
			).resolves.toMatchObject({
				kind: 'loaded',
				standard: {
					folders: [{ id: OTHER_FOLDERS[0] }, { id: DECLARED_FOLDER }],
					indexes: [
						{ files: [{ fileId: `${OTHER_FOLDERS[0]}/one` }] },
						{ files: [{ fileId: `${DECLARED_FOLDER}/one` }] },
					],
				},
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a cache inside a git work tree -> refused naming the work tree, nothing written there',
		async () => {
			const workspace = createStandardWorkspace({
				standards: foldersOfIds({ ids: [DECLARED_FOLDER] }),
			})
			installTestDialecte({ cwd: workspace.cwd })
			const environment = environmentWithCacheInWorkTree({ workspace })

			await expect(
				loadStandardIndexes({
					cwd: workspace.cwd,
					environment,
					standardIds: [DECLARED_FOLDER],
				}),
			).resolves.toEqual({
				kind: 'refused',
				message: expect.stringContaining('inside a git work tree'),
			})
			expect(entriesOf(environment.XDG_CACHE_HOME ?? '')).toEqual([])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a folder id the root does not hold -> refused naming the id and the known folders',
		async () => {
			const workspace = createStandardWorkspace({
				standards: foldersOfIds({ ids: [DECLARED_FOLDER] }),
			})
			installTestDialecte({ cwd: workspace.cwd })

			await expect(
				loadStandardIndexes({
					cwd: workspace.cwd,
					environment: workspace.environment,
					standardIds: [UNKNOWN_FOLDER],
				}),
			).resolves.toEqual({
				kind: 'refused',
				message: expect.stringMatching(holdingAll({ words: [UNKNOWN_FOLDER, DECLARED_FOLDER] })),
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})
