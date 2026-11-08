import { homedir } from 'node:os'
import { join } from 'node:path'

import { CACHE_LOCATION } from './standard-cache.constants.ts'

/** The cli's cache folder: `$XDG_CACHE_HOME/dialecte`, else `$HOME/.cache/dialecte`, from the given environment. */
export function standardCacheRoot(params: { environment: NodeJS.ProcessEnv }): string {
	const { environment } = params
	const cacheHome = environment[CACHE_LOCATION.environmentVariable]
	const base = cacheHome
		? cacheHome
		: join(environment[CACHE_LOCATION.homeVariable] || homedir(), CACHE_LOCATION.homeFolder)
	return join(base, CACHE_LOCATION.toolFolder)
}
