/**
 * Every lot file of a worktree: the root's and each package's, a package being the folder of a tracked
 * `package.json`. Git's index names the packages; never a walk of the ignored files.
 */
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { tryReadGit } from '../git.ts'
import { LOT_FILE } from './worktree.constants.ts'

import type { LotFile } from './lot-files.types.ts'

/**
 * The root's `.dialecte/lot.json`, then each tracked `package.json` folder's, in path order, each kept when the
 * file exists; outside git the root's only.
 * @intent find every lot file a hand-over or a close archives
 */
export function lotFilesOf(params: { root: string }): LotFile[] {
	const { root } = params
	// `**/` needs a `/`: the root's own package.json is never listed, the root is added apart
	const tracked = tryReadGit({ root, args: ['ls-files', '-z', '--', '**/package.json'] }) ?? ''
	const packagePaths = [
		'',
		...tracked
			.split('\0')
			.filter(Boolean)
			.map((file) => dirname(file))
			.sort(),
	]
	return packagePaths
		.map((packagePath) => ({ packagePath, file: join(root, packagePath, LOT_FILE) }))
		.filter((lotFile) => existsSync(lotFile.file))
}
