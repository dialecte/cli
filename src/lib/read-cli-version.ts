import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The version of this cli: the nearest package.json above this file (dist/ in the bundle, src/lib/ in the sources). */
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
