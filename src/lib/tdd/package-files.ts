/**
 * The files of a package: what git lists (tracked and untracked, ignored ones left out), or, outside a git repository
 * (the copy of the base a base run makes), every file of the tree but `node_modules`, `.git` and `dist`.
 */
import { readdirSync } from 'node:fs'
import { join, posix, relative, sep } from 'node:path'

import { readGit, tryReadGit } from '../git.ts'
import { TREE_SKIPPED_FOLDERS } from './tdd.constants.ts'

/** The package's files, relative to `root`, sorted: git's list in a repository (a git failure there throws), else the tree's. */
export function listPackageFiles(root: string): string[] {
	if (tryReadGit({ root, args: ['rev-parse', '--show-toplevel'] }) === undefined)
		return listTreeFiles(root)
	return readGit({
		root,
		args: ['ls-files', '--cached', '--others', '--exclude-standard', '--', '.'],
	})
		.split('\n')
		.filter(Boolean)
		.sort()
}

/** Every file under the folder but `node_modules`, `.git` and `dist`, relative to it, sorted. */
export function listTreeFiles(folder: string): string[] {
	return readdirSync(folder, { recursive: true, withFileTypes: true })
		.filter((entry) => !entry.isDirectory())
		.map((entry) =>
			posixPathOf({ path: relative(folder, join(entry.parentPath, entry.name)), separator: sep }),
		)
		.filter(
			(file) =>
				!TREE_SKIPPED_FOLDERS.some((skipped) => file === skipped || file.startsWith(`${skipped}/`)),
		)
		.sort()
}

/** A relative path written with `/`, whatever `separator` the platform split it with. */
export function posixPathOf(params: { path: string; separator: string }): string {
	return params.path.split(params.separator).join(posix.sep)
}
