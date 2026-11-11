/** Where a command word runs from, found by the cli itself: no shell, no `which`. */
import { accessSync, constants, statSync } from 'node:fs'
import { delimiter, isAbsolute, join, resolve, sep } from 'node:path'

/** Whether `path` is a file (a link followed) this process may execute; a folder or a plain file is not. */
export function isExecutableFile(path: string): boolean {
	try {
		if (!statSync(path).isFile()) return false
		accessSync(path, constants.X_OK)
		return true
	} catch {
		return false
	}
}

/**
 * The executable file `word` names: a path (absolute, or holding a separator: from `cwd`) when it is one; else the
 * first folder of `searchPath` holding it as an executable file (empty entries skipped). Undefined when none.
 */
export function findExecutable(params: {
	word: string
	searchPath: string | undefined
	cwd: string
}): string | undefined {
	const { word } = params
	if (isAbsolute(word) || word.includes(sep)) {
		const path = resolve(params.cwd, word)
		return isExecutableFile(path) ? path : undefined
	}
	for (const folder of (params.searchPath ?? '').split(delimiter)) {
		if (!folder) continue
		const path = join(folder, word)
		if (isExecutableFile(path)) return path
	}
	return undefined
}
