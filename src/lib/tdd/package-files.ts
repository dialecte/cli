/**
 * The files of a package: what git lists (tracked and untracked, ignored ones left out), or, outside a git repository
 * (the copy of the base a base run makes), every file of the tree but `node_modules`.
 */
import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

import { tryReadGit } from '../git.ts'
import { NODE_MODULES_FOLDER } from './tdd.constants.ts'

/** The package's files, relative to `root`, sorted. */
export function listPackageFiles(root: string): string[] {
	const listed = tryReadGit({
		root,
		args: ['ls-files', '--cached', '--others', '--exclude-standard', '--', '.'],
	})
	return listed === undefined ? listTreeFiles(root) : listed.split('\n').filter(Boolean).sort()
}

/** Every file under the folder but `node_modules`, relative to it, sorted. */
export function listTreeFiles(folder: string): string[] {
	return readdirSync(folder, { recursive: true, withFileTypes: true })
		.filter((entry) => !entry.isDirectory())
		.map((entry) => relative(folder, join(entry.parentPath, entry.name)))
		.filter((file) => file !== NODE_MODULES_FOLDER && !file.startsWith(`${NODE_MODULES_FOLDER}/`))
		.sort()
}
