import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** The nearest folder at or above `cwd` holding a package.json; undefined when there is none up to the root. */
export function packageRootOf(cwd: string): string | undefined {
	for (let folder = cwd; ; folder = dirname(folder)) {
		if (existsSync(join(folder, 'package.json'))) return folder
		if (dirname(folder) === folder) return undefined
	}
}
