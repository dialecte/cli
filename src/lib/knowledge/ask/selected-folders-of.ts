import { readStandardInput } from '../standard/read-standard-input.ts'

import type { StandardFolder } from '../standard/standard-input.types.ts'
import type { SelectedFolders, SelectedFoldersOfParams } from './ask.types.ts'

/**
 * The folders of the root a load reads, in id order: every one when no id is given, else the folder of each id once
 * (an id the root does not hold refused with the known ones). The one reader of `standard`, `ask` and `--no-standard`.
 */
export function selectedFoldersOf(params: SelectedFoldersOfParams): SelectedFolders {
	const { environment, standardIds } = params
	if (standardIds === undefined) {
		const input = readStandardInput({ environment })
		return input.kind === 'refused' ? input : { kind: 'selected', folders: input.input.selected }
	}
	const folders = new Map<string, StandardFolder>()
	for (const standardId of standardIds) {
		const input = readStandardInput({ environment, standardId })
		if (input.kind === 'refused') return input
		for (const folder of input.input.selected) folders.set(folder.id, folder)
	}
	return { kind: 'selected', folders: [...folders.values()].sort(byId) }
}

/** Whether a load reads the folder: a folder holding no `.md` file is skipped, not indexed. */
export function isReadableFolder(params: { folder: StandardFolder }): boolean {
	return params.folder.files.length > 0
}

function byId(first: StandardFolder, second: StandardFolder): number {
	return first.id < second.id ? -1 : first.id > second.id ? 1 : 0
}
