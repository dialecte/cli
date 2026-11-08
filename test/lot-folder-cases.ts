/** The folders the folder rule is asked about: one real lot in a real repository, and the look-alikes around it. */
import { mkdirSync, realpathSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'

import {
	BARE_NAME,
	BROKEN_NAME,
	CASE_NAMES,
	NAMELESS_NAME,
	OTHER_NAME,
	TEMPORARY_NAME,
} from './lot-folder-cases.constants.ts'
import { LOT_NAME } from './lot-stores.constants.ts'
import { createWorkspaceWithLots, linkLot } from './lot-stores.ts'
import { temporaryFolder } from './scratch-repository.ts'
import { identityOf, writeRecordFile } from './store-records.ts'

import type { BriefWorkspace } from './brief-workspace.types.ts'
import type { FolderCase, FolderLayout } from './lot-folder-cases.types.ts'

/** The cases for a layout, each titled by `CASE_NAMES`. */
export function describeFolderCases(layout: FolderLayout): FolderCase[] {
	const { lotFolder, link, store } = layout
	const git = join(layout.repository, '.git')
	return [
		{ name: CASE_NAMES.real, folder: lotFolder, lot: lotFolder },
		{ name: CASE_NAMES.linked, folder: link, lot: lotFolder },
		{ name: CASE_NAMES.otherLink, folder: layout.otherLink, lot: lotFolder },
		{ name: CASE_NAMES.store, folder: store, lot: undefined },
		{ name: CASE_NAMES.round, folder: join(lotFolder, 'round-1'), lot: undefined },
		{ name: CASE_NAMES.roundThroughLink, folder: join(link, 'round-1'), lot: undefined },
		{ name: CASE_NAMES.noRound, folder: join(lotFolder, 'transitions'), lot: undefined },
		{ name: CASE_NAMES.roundNotMade, folder: join(lotFolder, 'round-9'), lot: undefined },
		{ name: CASE_NAMES.temporary, folder: join(store, TEMPORARY_NAME), lot: undefined },
		{ name: CASE_NAMES.otherName, folder: join(store, OTHER_NAME), lot: undefined },
		{ name: CASE_NAMES.noIdentity, folder: join(store, BARE_NAME), lot: undefined },
		{ name: CASE_NAMES.brokenIdentity, folder: join(store, BROKEN_NAME), lot: undefined },
		{ name: CASE_NAMES.nameless, folder: join(store, NAMELESS_NAME), lot: undefined },
		{ name: CASE_NAMES.notMade, folder: join(store, '0042-repo-new'), lot: undefined },
		{
			name: CASE_NAMES.worktreeGit,
			folder: join(layout.worktreeGitStore, LOT_NAME),
			lot: undefined,
		},
		{ name: CASE_NAMES.git, folder: git, lot: undefined },
		{ name: CASE_NAMES.gitInner, folder: join(git, 'objects'), lot: undefined },
		{ name: CASE_NAMES.registry, folder: join(git, 'dialecte-handover'), lot: undefined },
		{ name: CASE_NAMES.loose, folder: join(layout.looseStore, LOT_NAME), lot: undefined },
		{ name: CASE_NAMES.repository, folder: layout.repository, lot: undefined },
		{ name: CASE_NAMES.missing, folder: join(layout.repository, 'nowhere'), lot: undefined },
	]
}

/** A lot in a repository and the look-alikes around it; builds the folders on disk, for the current test. */
export function buildFolderCases(): {
	workspace: BriefWorkspace
	layout: FolderLayout
	cases: FolderCase[]
} {
	const { workspace, folders } = createWorkspaceWithLots({ names: [LOT_NAME] })
	const lotFolder = folders[LOT_NAME]
	const store = realpathSync(workspace.store)
	const linkRoot = realpathSync(temporaryFolder('dialecte-lot-link-'))
	const link = linkLot({ worktree: linkRoot, lotFolder })
	const otherLink = join(linkRoot, 'other-name')
	symlinkSync(lotFolder, otherLink)
	mkdirSync(join(lotFolder, 'round-1'))

	writeIdentity({ store, folder: TEMPORARY_NAME, name: TEMPORARY_NAME })
	writeIdentity({ store, folder: OTHER_NAME, name: '0004-repo-elsewhere' })
	mkdirSync(join(store, BARE_NAME))
	writeRecordFile({ folder: join(store, BROKEN_NAME), name: 'identity.json', text: '{ not json' })
	writeRecordFile({ folder: join(store, NAMELESS_NAME), name: 'identity.json', text: '{}' })
	// the same shape outside a git common folder
	const looseStore = join(realpathSync(temporaryFolder('dialecte-loose-')), 'dialecte-lots')
	writeIdentity({ store: looseStore, folder: LOT_NAME, name: LOT_NAME })
	// a linked worktree's git folder: it holds HEAD but is no common folder (no objects, no refs)
	const worktreeGit = join(realpathSync(workspace.repository), '.git', 'worktrees', 'x')
	writeRecordFile({ folder: worktreeGit, name: 'HEAD', text: 'ref: refs/heads/main\n' })
	const worktreeGitStore = join(worktreeGit, 'dialecte-lots')
	writeIdentity({ store: worktreeGitStore, folder: LOT_NAME, name: LOT_NAME })

	const layout: FolderLayout = {
		repository: realpathSync(workspace.repository),
		store,
		lotFolder,
		link,
		otherLink,
		looseStore,
		worktreeGitStore,
	}
	return { workspace, layout, cases: describeFolderCases(layout) }
}

function writeIdentity(params: { store: string; folder: string; name: string }): void {
	writeRecordFile({
		folder: join(params.store, params.folder),
		name: 'identity.json',
		text: `${JSON.stringify(identityOf({ name: params.name }))}\n`,
	})
}
