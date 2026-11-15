/** A lot worktree for the tests of `rules`: a package at a base commit, the worktree cut from it, both branches moved on, a change. */
import { createBriefWorkspace, writeStoreLot } from './brief-workspace.ts'
import { addWorktreeFolder, linkLot } from './lot-stores.ts'
import {
	BASE_FILES,
	CHANGED_TEST_FILE,
	LOT_BRANCH_FILE,
	LOT_NAME,
	MAIN_BRANCH_FILE,
	RELEASE_TAG,
	TEST_FILE,
} from './rules-lot-worktree.constants.ts'
import { git, writeFiles } from './scratch-repository.ts'

import type { BriefWorkspace } from './brief-workspace.types.ts'
import type { LotWorktree, LotWorktreeKind, LotWorktreeSource } from './rules-lot-worktree.types.ts'

/** Writes `files`, commits them (only those paths) in the repository at `root`. */
function commitFiles(params: {
	root: string
	files: Record<string, string>
	message: string
}): void {
	const { root } = params
	writeFiles({ root, files: params.files })
	git({ root, args: ['add', '--', ...Object.keys(params.files)] })
	git({ root, args: ['commit', '-q', '-m', params.message] })
}

/** A worktree of the workspace's repository on its own branch, one commit on it and one on main (so the merge-base is neither tip); its root. */
function addMovedOnWorktree(params: { workspace: BriefWorkspace }): string {
	const { workspace } = params
	const root = addWorktreeFolder({ workspace, folderName: LOT_NAME })
	commitFiles({ root, files: { [LOT_BRANCH_FILE]: 'export {}\n' }, message: 'chore: lot note' })
	commitFiles({
		root: workspace.repository,
		files: { [MAIN_BRANCH_FILE]: 'export {}\n' },
		message: 'chore: main note',
	})
	return root
}

/**
 * The base commit holds the package and the old splice; the worktree is cut from it on its own branch, one unrelated
 * file is committed on the lot's branch and one on main (so the merge-base is neither tip), and the test file is then
 * changed, not committed. `source` says what the worktree's lot link holds; the base branch and a release tag are the other sources.
 */
export function createLotWorktree(params: {
	source: LotWorktreeSource
	kind?: LotWorktreeKind
	/** `absent`: the repository's `main` is renamed, no base branch is left (default `present`). */
	baseBranch?: 'present' | 'absent'
	/** Tags the base commit with the package's release tag. */
	releaseTag?: boolean
	/** `on-main`: no worktree and no commit on top of the base; the change is uncommitted on `main` itself (default `worktree`). */
	placement?: 'worktree' | 'on-main'
}): LotWorktree {
	const workspace = createBriefWorkspace()
	commitFiles({
		root: workspace.repository,
		files: { ...BASE_FILES[params.kind ?? 'dialecte'] },
		message: 'chore: package',
	})
	const baseCommit = git({ root: workspace.repository, args: ['rev-parse', 'HEAD'] }).trim()
	const shortSha = git({
		root: workspace.repository,
		args: ['rev-parse', '--short', 'HEAD'],
	}).trim()
	const root =
		params.placement === 'on-main' ? workspace.repository : addMovedOnWorktree({ workspace })
	writeFiles({ root, files: { [TEST_FILE]: CHANGED_TEST_FILE } })
	const { source } = params
	const kind = params.kind ?? 'dialecte'
	const releaseTag = params.releaseTag === true ? RELEASE_TAG[kind] : undefined
	if (releaseTag !== undefined)
		git({ root: workspace.repository, args: ['tag', releaseTag, baseCommit] })
	if (params.baseBranch === 'absent')
		git({ root: workspace.repository, args: ['branch', '-m', 'main', 'trunk'] })
	const linkedBase = {
		'lot-link': { ref: 'main', commit: baseCommit },
		'lot-link-commit-only': { ref: '', commit: baseCommit },
		'unreadable-link': { ref: 'no-such-ref', commit: 'a'.repeat(40) },
	}[source as string]
	if (linkedBase !== undefined) {
		const lotFolder = writeStoreLot({
			workspace,
			name: LOT_NAME,
			scope: ['src/'],
			base: linkedBase,
		})
		linkLot({ worktree: root, lotFolder })
	}
	return { root, shortSha, baseCommit, ...(releaseTag !== undefined && { releaseTag }) }
}
