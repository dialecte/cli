import { homedir } from 'node:os'
import { join } from 'node:path'

import { DEFAULT_STATE_SEGMENTS, STATE_HOME_VARIABLE } from './store.constants.ts'

import type { StateFolderLocation } from './store.types.ts'

/**
 * `$XDG_STATE_HOME` (an empty one is unset), else `<home>/.local/state`; the environment and the home default to
 * the process's. The store list and the heavy markers are built under it.
 */
export function stateFolder(params: StateFolderLocation = {}): string {
	const environment = params.environment ?? process.env
	// an empty variable is an unset one
	return (
		environment[STATE_HOME_VARIABLE] || join(params.home ?? homedir(), ...DEFAULT_STATE_SEGMENTS)
	)
}
