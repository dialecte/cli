/** Several scratch workspaces holding lots, and the store list that names their stores, for the tests of ids. */
import { mkdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { createBriefWorkspace, writeStoreLot } from './brief-workspace.ts'
import { FIXTURE_SCOPE, LOT_LINK_SEGMENTS, STORE_LIST_SEGMENTS } from './lot-stores.constants.ts'
import { git } from './scratch-repository.ts'

import type { BriefWorkspace } from './brief-workspace.types.ts'

/** A workspace (its repository on `main`) whose store holds the lots `names`; `XDG_STATE_HOME` points into the test's folder. */
export function createWorkspaceWithLots(params: { names: string[] }): {
	workspace: BriefWorkspace
	/** The real path of each lot folder, by lot name. */
	folders: Record<string, string>
} {
	const workspace = createBriefWorkspace()
	const folders: Record<string, string> = {}
	for (const name of params.names)
		// the branch's tail is what the lot's name ends with (`<index>-<repository>-<tail>`), as `worktree add` names it
		folders[name] = realpathSync(
			writeStoreLot({
				workspace,
				name,
				scope: FIXTURE_SCOPE,
				branch: `feat/${name.split('-').slice(2).join('-')}`,
			}),
		)
	return { workspace, folders }
}

/** Writes the store list under the current `XDG_STATE_HOME`, one line per store; its path. */
export function writeStoreListFile(params: { stores: string[] }): string {
	const state = process.env.XDG_STATE_HOME
	if (!state) throw new Error('XDG_STATE_HOME is not set: a test never writes the person’s list')
	const path = join(state, ...STORE_LIST_SEGMENTS)
	mkdirSync(join(path, '..'), { recursive: true })
	writeFileSync(path, params.stores.map((store) => `${store}\n`).join(''))
	return path
}

/**
 * A real git worktree of the workspace's repository at `<workspace>/.worktrees/<folderName>` on a new branch; its
 * real path. The lot of the same index is made apart (a throwaway is a worktree beside the lot's own).
 */
export function addWorktreeFolder(params: {
	workspace: BriefWorkspace
	folderName: string
}): string {
	const path = join(params.workspace.workspace, '.worktrees', params.folderName)
	git({
		root: params.workspace.repository,
		args: ['worktree', 'add', '-q', '-b', `feat/${params.folderName}`, path],
	})
	return realpathSync(path)
}

/** Makes `<worktree>/.dialecte/lot`, a link to the lot folder. */
export function linkLot(params: { worktree: string; lotFolder: string }): string {
	const link = join(params.worktree, ...LOT_LINK_SEGMENTS)
	mkdirSync(join(link, '..'), { recursive: true })
	symlinkSync(params.lotFolder, link)
	return link
}
