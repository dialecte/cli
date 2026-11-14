import { join } from 'node:path'

import {
	environmentWithoutStandard,
	foldersOfIds,
	holdingAll,
} from '../../../../test/standard-selection-fixtures.ts'
import {
	DECLARED_FOLDER,
	DECLARED_KEY,
	DECLARED_NAME,
	FULL_WIDTH_NAME,
	OTHER_FOLDERS,
	SAME_KEY_FOLDER,
	STRAY_FILE,
	UNRELATED_SAME_KEY_FOLDERS,
} from '../../../../test/standard-selection.constants.ts'
import { createStandardWorkspace, writeTextFile } from '../../../../test/standard-workspace.ts'
import { selectStandard } from './select-standard.ts'

import { describe, expect, it } from 'vitest'

import type { StandardWorkspace } from '../../../../test/standard-workspace.types.ts'
import type { StandardSelection } from './ask.types.ts'

type SelectRow = {
	folders: readonly string[]
	standardName: string | undefined
	environment?: (workspace: StandardWorkspace) => NodeJS.ProcessEnv
	prepare?: (workspace: StandardWorkspace) => void
	expected: StandardSelection
}

describe('selectStandard: the folders an ask reads for the dialecte standard (D13, cases 32k, 32m)', () => {
	const rows: Record<string, SelectRow> = {
		'32k a folder with the key of the declared name -> documents with its id': {
			folders: [DECLARED_FOLDER],
			standardName: DECLARED_NAME,
			expected: {
				kind: 'documents',
				folderIds: [DECLARED_FOLDER],
				name: DECLARED_NAME,
				key: DECLARED_KEY,
			},
		},
		'32k a declared name of another case and punctuation, same key -> the same folder': {
			folders: [DECLARED_FOLDER],
			standardName: 'EXAMPLE_0000.',
			expected: {
				kind: 'documents',
				folderIds: [DECLARED_FOLDER],
				name: 'EXAMPLE_0000.',
				key: DECLARED_KEY,
			},
		},
		'32k a declared name with full-width characters, same key after NFKC -> the same folder': {
			folders: [DECLARED_FOLDER],
			standardName: FULL_WIDTH_NAME,
			expected: {
				kind: 'documents',
				folderIds: [DECLARED_FOLDER],
				name: FULL_WIDTH_NAME,
				key: DECLARED_KEY,
			},
		},
		'32k other folders beside it are not selected': {
			folders: [...OTHER_FOLDERS, DECLARED_FOLDER],
			standardName: DECLARED_NAME,
			expected: {
				kind: 'documents',
				folderIds: [DECLARED_FOLDER],
				name: DECLARED_NAME,
				key: DECLARED_KEY,
			},
		},
		'32l an unrelated pair sharing one key beside the declared folder does not refuse': {
			folders: [...UNRELATED_SAME_KEY_FOLDERS, DECLARED_FOLDER],
			standardName: DECLARED_NAME,
			expected: {
				kind: 'documents',
				folderIds: [DECLARED_FOLDER],
				name: DECLARED_NAME,
				key: DECLARED_KEY,
			},
		},
		'no declared name and folders exist -> documents with every folder, in id order': {
			folders: [...OTHER_FOLDERS, DECLARED_FOLDER],
			standardName: undefined,
			expected: {
				kind: 'documents',
				folderIds: [OTHER_FOLDERS[0], OTHER_FOLDERS[1], DECLARED_FOLDER],
				name: null,
				key: null,
			},
		},
		'32m DIALECTE_STANDARD set, no folder of the name key -> none with the line naming the name, key and folders':
			{
				folders: OTHER_FOLDERS,
				standardName: DECLARED_NAME,
				expected: {
					kind: 'none',
					name: DECLARED_NAME,
					key: DECLARED_KEY,
					line: `no folder for "${DECLARED_NAME}" (${DECLARED_KEY}); folders: ${OTHER_FOLDERS.join(', ')}`,
					known: [...OTHER_FOLDERS],
				},
			},
		'32m no DIALECTE_STANDARD -> none, no line': {
			folders: OTHER_FOLDERS,
			standardName: DECLARED_NAME,
			environment: (workspace) => environmentWithoutStandard({ workspace }),
			expected: {
				kind: 'none',
				name: DECLARED_NAME,
				key: DECLARED_KEY,
				line: null,
				known: [],
			},
		},
		'no DIALECTE_STANDARD and no declared name -> none, no line, no name': {
			folders: OTHER_FOLDERS,
			standardName: undefined,
			environment: (workspace) => environmentWithoutStandard({ workspace }),
			expected: { kind: 'none', name: null, key: null, line: null, known: [] },
		},
	}

	for (const [name, row] of Object.entries(rows))
		it(`${name}`, () => {
			const workspace = createStandardWorkspace({ standards: foldersOfIds({ ids: row.folders }) })
			row.prepare?.(workspace)

			expect(
				selectStandard({
					environment: row.environment?.(workspace) ?? workspace.environment,
					standardName: row.standardName,
				}),
			).toEqual(row.expected)
		})
})

describe('selectStandard: a root with no standard folder is no documents, never a refusal (D13)', () => {
	const rows: Record<string, string | undefined> = {
		'a declared name': DECLARED_NAME,
		'no declared name': undefined,
	}

	for (const [name, standardName] of Object.entries(rows))
		it(`${name}: none, the line naming the root and saying it holds no standard folder`, () => {
			const workspace = createStandardWorkspace()

			expect(selectStandard({ environment: workspace.environment, standardName })).toEqual({
				kind: 'none',
				name: standardName ?? null,
				key: standardName === undefined ? null : DECLARED_KEY,
				line: expect.stringMatching(
					holdingAll({ words: [workspace.root, 'holds no standard folder'] }),
				),
				known: [],
			})
		})
})

describe('selectStandard: refusals, exit 2 (cases 32l, 32m)', () => {
	type RefusalRow = {
		folders: readonly string[]
		standardName: string | undefined
		prepare?: (workspace: StandardWorkspace) => void
		mentions: string[]
	}

	const rows: Record<string, RefusalRow> = {
		'32l two folders with one key, both named in the refusal': {
			folders: [DECLARED_FOLDER, SAME_KEY_FOLDER],
			standardName: DECLARED_NAME,
			mentions: [DECLARED_FOLDER, SAME_KEY_FOLDER],
		},
		'32m a damaged root (a .md file at its top) -> refused naming the file, never none': {
			folders: [DECLARED_FOLDER],
			standardName: DECLARED_NAME,
			prepare: (workspace) =>
				writeTextFile({ path: join(workspace.root, STRAY_FILE), text: 'stray text\n' }),
			mentions: [STRAY_FILE],
		},
		'32m a damaged root with no declared name -> refused too': {
			folders: [DECLARED_FOLDER],
			standardName: undefined,
			prepare: (workspace) =>
				writeTextFile({ path: join(workspace.root, STRAY_FILE), text: 'stray text\n' }),
			mentions: [STRAY_FILE],
		},
	}

	for (const [name, row] of Object.entries(rows))
		it(`${name}`, () => {
			const workspace = createStandardWorkspace({ standards: foldersOfIds({ ids: row.folders }) })
			row.prepare?.(workspace)

			expect(
				selectStandard({ environment: workspace.environment, standardName: row.standardName }),
			).toEqual({ refused: expect.stringMatching(holdingAll({ words: row.mentions })) })
		})
})
