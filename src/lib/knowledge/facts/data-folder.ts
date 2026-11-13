import { homedir } from 'node:os'
import { join } from 'node:path'

import { DATA_HOME_VARIABLE, DEFAULT_DATA_SEGMENTS } from '../../store/store.constants.ts'
import { fillMessage } from '../standard/fill-message.ts'
import { workTreeHolding } from '../standard/work-tree-holding.ts'
import { FACTS_SEGMENTS, FACTS_WORK_TREE_REFUSAL } from './facts.constants.ts'

import type { DataFolderLocation } from './facts.types.ts'

/** `$XDG_DATA_HOME` (an empty one is unset), else `<home>/.local/share`; the environment and the home default to the process's. */
export function dataFolder(params: DataFolderLocation = {}): string {
	const environment = params.environment ?? process.env
	// an empty variable is an unset one
	return environment[DATA_HOME_VARIABLE] || join(params.home ?? homedir(), ...DEFAULT_DATA_SEGMENTS)
}

/** The facts ledger's folder: `<data>/dialecte/facts`. */
export function factsFolder(params: DataFolderLocation = {}): string {
	return join(dataFolder(params), ...FACTS_SEGMENTS)
}

/**
 * The refusal of a facts folder inside a git work tree (symlinks resolved, a folder not made yet judged by its
 * nearest existing ancestor): the folder, the work tree's top and the fix; undefined when no work tree holds it.
 */
export function factsFolderRefusal(params: { folder: string }): string | undefined {
	const top = workTreeHolding({ path: params.folder })
	return top === undefined
		? undefined
		: fillMessage({
				template: FACTS_WORK_TREE_REFUSAL,
				values: { path: params.folder, top, variable: DATA_HOME_VARIABLE },
			})
}
