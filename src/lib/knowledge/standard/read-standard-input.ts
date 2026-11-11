import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { readStandardRoot } from '../../standard/read-standard-root.ts'
import { fillMessage } from './fill-message.ts'
import { standardFilesOf } from './standard-files-of.ts'
import { standardFoldersOf } from './standard-folders-of.ts'
import {
	HIDDEN_NAME_START,
	INPUT_MESSAGES,
	NAME_LIST_SEPARATOR,
	STANDARD_FILE_EXTENSION,
	STANDARD_LAYOUT,
} from './standard-input.constants.ts'
import { workTreeHolding } from './work-tree-holding.ts'

import type {
	ReadStandardInputParams,
	StandardEntry,
	StandardFolder,
	StandardInputAnswer,
} from './standard-input.types.ts'

/**
 * The root `DIALECTE_STANDARD` names and the standard folders a command works on, each with its files, or
 * why not: no root, a root that is a file or holds `.md` files directly (said with the expected layout),
 * a root or a selected standard folder inside a git work tree, two folders or two files whose ids collide,
 * a `--standard` id with no folder. Reads only: nothing is written.
 */
export function readStandardInput(params: ReadStandardInputParams): StandardInputAnswer {
	const root = readStandardRoot({ environment: params.environment })
	const rootRefusal = refusalOfRoot({ root })
	if (rootRefusal !== undefined || root === undefined)
		return refused(rootRefusal ?? INPUT_MESSAGES.notSet, STANDARD_LAYOUT)
	const workTree = workTreeRefusal({ path: root })
	if (workTree) return refused(workTree)
	const entries = entriesOf({ folder: root })
	const topLevelFiles = entries
		.filter((entry) => entry.kind === 'file' && entry.name.endsWith(STANDARD_FILE_EXTENSION))
		.filter((entry) => !entry.name.startsWith(HIDDEN_NAME_START))
		.map((entry) => entry.name)
		.sort()
	if (topLevelFiles.length > 0)
		return refused(
			fillMessage({
				template: INPUT_MESSAGES.topLevelFiles,
				values: { path: root, names: topLevelFiles.join(NAME_LIST_SEPARATOR) },
			}),
			STANDARD_LAYOUT,
		)
	const folders = standardFoldersOf({ entries })
	if (folders.kind === 'collision')
		return refused(
			fillMessage({
				template: INPUT_MESSAGES.folderCollision,
				values: { names: folders.names.join(NAME_LIST_SEPARATOR) },
			}),
		)
	if (folders.kept.length === 0)
		return refused(
			fillMessage({ template: INPUT_MESSAGES.noStandard, values: { path: root } }),
			STANDARD_LAYOUT,
		)
	const known = folders.kept.map((folder) => folder.id)
	const wanted = params.standardId?.toLowerCase()
	const chosen = folders.kept.filter((folder) => wanted === undefined || folder.id === wanted)
	if (chosen.length === 0 && wanted !== undefined)
		return refused(
			fillMessage({
				template: INPUT_MESSAGES.unknownStandard,
				values: { id: wanted, path: root, known: known.join(NAME_LIST_SEPARATOR) || 'none' },
			}),
		)
	const selected: StandardFolder[] = []
	for (const named of chosen) {
		const folder = join(root, named.name)
		const folderRefusal = workTreeRefusal({ path: folder })
		if (folderRefusal) return refused(folderRefusal)
		const files = standardFilesOf({ standardId: named.id, entries: entriesOf({ folder }) })
		if (files.kind === 'collision')
			return refused(
				fillMessage({
					template: INPUT_MESSAGES.fileCollision,
					values: { id: named.id, names: files.names.join(NAME_LIST_SEPARATOR) },
				}),
			)
		selected.push({
			...named,
			folder,
			files: files.kept.map((file) => ({ ...file, path: join(folder, file.name) })),
		})
	}
	return { kind: 'input', input: { root, known, selected } }
}

/** The refusal of a path inside a git work tree, undefined when no work tree holds it. */
export function workTreeRefusal(params: { path: string }): string | undefined {
	const top = workTreeHolding({ path: params.path })
	return top === undefined
		? undefined
		: fillMessage({ template: INPUT_MESSAGES.workTree, values: { path: params.path, top } })
}

/** Why the root is no root folder; undefined for a folder that exists. */
function refusalOfRoot(params: { root: string | undefined }): string | undefined {
	const { root } = params
	if (root === undefined) return INPUT_MESSAGES.notSet
	if (!existsSync(root))
		return fillMessage({ template: INPUT_MESSAGES.missing, values: { path: root } })
	if (!statSync(root).isDirectory())
		return fillMessage({ template: INPUT_MESSAGES.notFolder, values: { path: root } })
	return undefined
}

/** A folder's entries, each symlink followed to the kind of its target; a broken link is left out. */
function entriesOf(params: { folder: string }): StandardEntry[] {
	return readdirSync(params.folder).flatMap((name): StandardEntry[] => {
		const path = join(params.folder, name)
		if (!existsSync(path)) return []
		const stats = statSync(realpathSync(path))
		if (stats.isDirectory()) return [{ name, kind: 'folder' }]
		return stats.isFile() ? [{ name, kind: 'file' }] : []
	})
}

function refused(message: string, layout?: string): StandardInputAnswer {
	return layout === undefined ? { kind: 'refused', message } : { kind: 'refused', message, layout }
}
