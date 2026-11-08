import { existsSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { GIT_ENTRY } from './standard-input.constants.ts'

/**
 * The top of the git work tree a path lies in (the path itself included), once symlinks are resolved;
 * undefined when none holds it. A path that does not exist yet is judged by its nearest existing ancestor.
 * A work tree's top holds a `.git` folder, or a `.git` file in a linked work tree.
 */
export function workTreeHolding(params: { path: string }): string | undefined {
	let folder = realpathSync(nearestExisting(params.path))
	for (;;) {
		if (existsSync(join(folder, GIT_ENTRY))) return folder
		const parent = dirname(folder)
		if (parent === folder) return undefined
		folder = parent
	}
}

function nearestExisting(path: string): string {
	let existing = path
	while (!existsSync(existing)) existing = dirname(existing)
	return existing
}
