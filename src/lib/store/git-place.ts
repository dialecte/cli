/** Where a folder lies with respect to git, by file reads only (no git, no child process). */
import { realpathSync } from 'node:fs'
import { basename, dirname } from 'node:path'

import { workTreeHolding } from '../knowledge/standard/work-tree-holding.ts'
import { isCommonFolder } from './lot-folder.ts'
import { GIT_ENTRY } from './store.constants.ts'

/**
 * The git work tree top (a `.git` folder or file at or above it) or the git folder (a `.git` folder, a git common
 * folder: `HEAD`, `objects/`, `refs/`) that holds the existing `folder`, the folder itself included; undefined when
 * none does.
 */
export function gitPlaceHolding(params: { folder: string }): string | undefined {
	const top = workTreeHolding({ path: params.folder })
	if (top !== undefined) return top
	for (let folder = realpathSync(params.folder); ; folder = dirname(folder)) {
		if (basename(folder) === GIT_ENTRY || isCommonFolder(folder)) return folder
		if (dirname(folder) === folder) return undefined
	}
}
