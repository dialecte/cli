import { stateHomeOf } from './state-home.ts'

import type { StateFolderLocation } from './store.types.ts'

/**
 * `$XDG_STATE_HOME` when it is an absolute path, else `<home>/.local/state`: an empty or relative variable counts as
 * unset, as the XDG base-directory rule asks. The environment and the home default to the process's. The store list,
 * the heavy markers, the plan marks, the asks folder and the orchestrator state are built under it.
 */
export function stateFolder(params: StateFolderLocation = {}): string {
	return stateHomeOf(params).path
}
