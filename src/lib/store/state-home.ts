import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'

import { DEFAULT_STATE_SEGMENTS, STATE_HOME_VARIABLE } from './store.constants.ts'

import type { StateFolderLocation, StateHome } from './store.types.ts'

/**
 * The state home and where it came from: an absolute `$XDG_STATE_HOME` (`variable`), else `<home>/.local/state`
 * (`home`). An empty or relative variable counts as unset, as the XDG base-directory rule asks. The environment and
 * the home default to the process's.
 */
export function stateHomeOf(params: StateFolderLocation = {}): StateHome {
	const environment = params.environment ?? process.env
	const variable = environment[STATE_HOME_VARIABLE]
	if (variable !== undefined && variable !== '' && isAbsolute(variable))
		return { path: variable, origin: 'variable' }
	return { path: join(params.home ?? homedir(), ...DEFAULT_STATE_SEGMENTS), origin: 'home' }
}
