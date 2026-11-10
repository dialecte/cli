/**
 * The links that may reach a worktree about to be removed, read once per command: the links directly in the
 * workspace roots (`linkRootsOf`), and those in `node_modules/` and each `node_modules/@*` scope of every
 * registered worktree and main checkout of every repository of the workspace (a sibling's
 * `node_modules/@dialecte/core` linked into a lot's worktree). Entries are read with their types: a link is
 * never followed, a `node_modules` that is itself a link is not read.
 */
import { lstatSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { listWorktrees } from '../worktree/add-worktree.ts'
import { findLinks, linkRootsOf, listMainCheckouts } from '../worktree/prune-worktrees.ts'
import { NODE_MODULES_PREFIX } from '../worktree/worktree.constants.ts'
import { NODE_MODULES_SCOPE_PREFIX } from './read-link-scan-set.constants.ts'

import type { FolderLink } from '../worktree/worktree.types.ts'

export function readLinkScanSet(params: {
	workspace: string
	/** Where rehearsal clones are made (and were made by earlier cli versions). */
	scratchRoots: readonly string[]
}): FolderLink[] {
	const checkouts = [...new Set(listMainCheckouts(params.workspace).flatMap(registeredCheckoutsOf))]
	const folders = [
		...linkRootsOf({
			workspace: params.workspace,
			scratchRoots: [...new Set(params.scratchRoots)],
		}),
		...checkouts.flatMap((checkout) => nodeModulesFoldersOf(join(checkout, NODE_MODULES_PREFIX))),
	]
	return [...new Set(folders)].flatMap((folder) => findLinks(folder))
}

/** Every worktree git registers for the repository, its main checkout first; none when git cannot list them. */
function registeredCheckoutsOf(repository: string): string[] {
	try {
		return listWorktrees(repository).map((worktree) => worktree.path)
	} catch {
		return [repository]
	}
}

/** `node_modules` and its scope folders, when `node_modules` is a folder (not a link). */
function nodeModulesFoldersOf(nodeModules: string): string[] {
	try {
		if (!lstatSync(nodeModules).isDirectory()) return []
		const scopes = readdirSync(nodeModules, { withFileTypes: true })
			.filter((entry) => entry.isDirectory() && entry.name.startsWith(NODE_MODULES_SCOPE_PREFIX))
			.map((entry) => join(nodeModules, entry.name))
		return [nodeModules, ...scopes]
	} catch {
		// no node_modules there
		return []
	}
}
