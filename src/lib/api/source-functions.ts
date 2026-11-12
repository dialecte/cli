import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { isFolder } from '../file-system.ts'
import { isInWorkTree, listRepositoryFiles } from '../git.ts'
import { listTreeFiles } from '../review-rounds/worktree-state.ts'
import { TEXT_COLLATOR } from '../skills/api-index.constants.ts'
import { TEST_FILE_PATTERN } from '../tdd/tdd.constants.ts'
import { parseSourceFile } from './source-file-functions.ts'
import {
	NO_SOURCE_FOLDER_NOTE,
	SOURCE_FILE_PATTERN,
	SOURCE_FOLDER,
} from './source-functions.constants.ts'
import { indexSourceFiles } from './source-index.ts'

import type { ParseSourceFile, SourceFunctions } from './source-functions.types.ts'

/** Reads the exported functions of the package's tracked and untracked-not-ignored `src/**\/*.ts` files, tests left out. */
export function readSourceFunctions(params: {
	root: string
	parse?: ParseSourceFile
}): SourceFunctions {
	const { root } = params
	const folder = join(root, SOURCE_FOLDER)
	if (!isFolder(folder))
		return { entries: [], notes: [NO_SOURCE_FOLDER_NOTE.replace('{root}', root)] }
	const parsedFiles = indexSourceFiles({
		root,
		files: listSourceFiles(root),
		parse: params.parse ?? parseSourceFile,
	})
	return {
		entries: parsedFiles.flatMap(function entriesOfFile(parsed) {
			return parsed.entries
		}),
		notes: parsedFiles.flatMap(function noteOfFile(parsed) {
			return parsed.note === undefined ? [] : [parsed.note]
		}),
	}
}

/**
 * The source files to read, relative to `root` and sorted: in a git work tree the ones git tracks or would add
 * (ignored ones left out), else every file of the folder; TypeScript only, declaration files and tests left out.
 */
function listSourceFiles(root: string): string[] {
	const files = isInWorkTree(root)
		? listRepositoryFiles({ root, folder: SOURCE_FOLDER }).filter(function isOnDisk(file) {
				return existsSync(join(root, file))
			})
		: listTreeFiles(join(root, SOURCE_FOLDER)).map(function pathFromRoot(file) {
				return `${SOURCE_FOLDER}/${file}`
			})
	return files
		.filter(function isSourceFile(file) {
			return SOURCE_FILE_PATTERN.test(file) && !TEST_FILE_PATTERN.test(file)
		})
		.sort(TEXT_COLLATOR.compare)
}
