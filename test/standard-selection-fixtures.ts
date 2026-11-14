/**
 * Shared by the standard selection and loader tests: environments of a standard workspace (no root, a cache inside a
 * git work tree), the files key of a folder as the standard reads it, and the files of a folder of synthetic text.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { readStandardInput } from '../src/lib/knowledge/standard/read-standard-input.ts'
import { standardFolderFilesKey } from '../src/lib/knowledge/standard/standard-files-key.ts'
import { FOLDER_WORD } from './standard-selection.constants.ts'
import { GIT_FOLDER } from './standard-workspace.constants.ts'
import { sampleStandardText } from './standard-workspace.ts'

import type { StandardsDescription, StandardWorkspace } from './standard-workspace.types.ts'

/** The workspace's environment without `DIALECTE_STANDARD`. */
export function environmentWithoutStandard(params: {
	workspace: StandardWorkspace
}): NodeJS.ProcessEnv {
	const { workspace } = params
	return { XDG_CACHE_HOME: workspace.cache, HOME: workspace.home }
}

/** The workspace's environment with the cache inside a git work tree (a folder holding a `.git` folder). */
export function environmentWithCacheInWorkTree(params: {
	workspace: StandardWorkspace
}): NodeJS.ProcessEnv {
	const { workspace } = params
	const repository = join(workspace.base, 'repository')
	mkdirSync(join(repository, GIT_FOLDER), { recursive: true })
	return { ...workspace.environment, XDG_CACHE_HOME: join(repository, 'cache') }
}

/** The files key of one standard folder of the environment's root, as `standardFolderFilesKey` gives it. */
export function filesKeyOfFolder(params: {
	environment: NodeJS.ProcessEnv
	standardId: string
}): string {
	const input = readStandardInput({
		environment: params.environment,
		standardId: params.standardId,
	})
	if (input.kind === 'refused') throw new Error(input.message)
	const [selected] = input.input.selected
	return standardFolderFilesKey({ standard: selected })
}

/** A pattern a text matches when it holds every one of the words, in any order. */
export function holdingAll(params: { words: readonly string[] }): RegExp {
	const lookaheads = params.words.map((word) => `(?=[\\s\\S]*${escapedForPattern(word)})`)
	return new RegExp(`^${lookaheads.join('')}`, 'u')
}

function escapedForPattern(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

/** Folders of one synthetic file each, by folder id. */
export function foldersOfIds(params: { ids: readonly string[] }): StandardsDescription {
	return Object.fromEntries(
		params.ids.map((id) => [id, { 'one.md': sampleStandardText({ word: FOLDER_WORD }) }]),
	)
}
