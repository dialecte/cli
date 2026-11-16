/** The package root a config call reads `.dialecterc` in. */
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { GIT_ENTRY } from '../store/store.constants.ts'
import { CONFIG_ROOT_MARKERS } from './config.constants.ts'

/**
 * The package root of `cwd`: the nearest folder at or above it holding `.dialecterc` or package.json, up to the
 * repository's top level (the folder holding `.git`); else that top level; else `cwd` itself.
 */
export function configRootOf(params: { cwd: string }): string {
	for (let folder = params.cwd; ; folder = dirname(folder)) {
		if (CONFIG_ROOT_MARKERS.some((marker) => existsSync(join(folder, marker)))) return folder
		if (existsSync(join(folder, GIT_ENTRY))) return folder
		if (dirname(folder) === folder) return params.cwd
	}
}
