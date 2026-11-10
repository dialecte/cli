import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The `version` of the nearest package.json above `startFolder`; by default this file's folder (dist/ in the bundle,
 * src/lib/ in the sources), so the cli's own version. Throws when no package.json is above it.
 *
 * @intent read the installed cli's version, read a package's version from the folder it runs in, report the version a program serves its lookups with
 */
export function readCliVersion(params: { startFolder?: string } = {}): string {
	const startFolder = params.startFolder ?? dirname(fileURLToPath(import.meta.url))
	let folder = startFolder
	while (!existsSync(join(folder, 'package.json'))) {
		const parent = dirname(folder)
		if (parent === folder)
			throw new Error(`no package.json above ${startFolder}: cannot read the cli version`)
		folder = parent
	}
	const { version } = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8'))
	return version
}
