/**
 * Every lot file of a worktree: the root's and each package's, a package being the folder of a `package.json`
 * git's index tracks, or one of the base commits held (a package the lot deleted). Never a walk of the ignored
 * files.
 */
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { tryReadGit } from '../git.ts'
import { PACKAGE_MANIFEST_FILE } from '../package-json.constants.ts'
import { LOT_FILE } from './worktree.constants.ts'

import type { LotFile } from './lot-files.types.ts'

/**
 * The root's `.dialecte/lot.json`, then each package's in path order, each kept when the file exists; outside git
 * the root's only. A package is the folder of a `package.json` in the index (deleted from the working tree or not:
 * its lot file is what counts) or in one of `bases`.
 * @intent find every lot file a hand-over or a close archives
 */
export function lotFilesOf(params: { root: string; bases?: readonly string[] }): LotFile[] {
	const { root } = params
	// `**/` needs a `/`: the root's own package.json is never listed, the root is added apart
	const tracked = tryReadGit({
		root,
		args: ['ls-files', '-z', '--', `**/${PACKAGE_MANIFEST_FILE}`],
	})
	const based = (params.bases ?? []).map(function packageFilesAt(base) {
		return tryReadGit({ root, args: ['ls-tree', '-r', '-z', '--name-only', base] }) ?? ''
	})
	const packagePaths = [tracked ?? '', ...based]
		.flatMap((listing) => listing.split('\0'))
		.filter((file) => file.endsWith(`/${PACKAGE_MANIFEST_FILE}`))
		.map((file) => dirname(file))
	return ['', ...[...new Set(packagePaths)].sort()]
		.map((packagePath) => ({ packagePath, file: join(root, packagePath, LOT_FILE) }))
		.filter((lotFile) => existsSync(lotFile.file))
}
