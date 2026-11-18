/** A lot worktree for the tests of `rules`: a package at a base commit, the worktree cut from it, both branches moved on, a change. */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { STACK_FILE, STACK_SCHEMA } from '../src/lib/store/stack.constants.ts'
import { createBriefWorkspace, writeStoreLot } from './brief-workspace.ts'
import { addWorktreeFolder, linkLot } from './lot-stores.ts'
import {
	BASE_FILES,
	CHANGED_TEST_FILE,
	LOT_BRANCH_FILE,
	LOT_NAME,
	MAIN_BRANCH_FILE,
	PARENT_BRANCH,
	PARENT_LOT_NAME,
	RELEASE_TAG,
	TEST_FILE,
} from './rules-lot-worktree.constants.ts'
import { git, writeFiles } from './scratch-repository.ts'

import type { BriefWorkspace } from './brief-workspace.types.ts'
import type {
	LotWorktree,
	LotWorktreeKind,
	LotWorktreeMove,
	LotWorktreeSource,
	StackParentState,
} from './rules-lot-worktree.types.ts'

/** Writes `files`, commits them (only those paths) in the repository at `root`. */
export function commitFiles(params: {
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

/** The full and the short id of HEAD in the repository at `root`. */
function headIdsOf(root: string): { commit: string; shortSha: string } {
	return {
		commit: git({ root, args: ['rev-parse', 'HEAD'] }).trim(),
		shortSha: git({ root, args: ['rev-parse', '--short', 'HEAD'] }).trim(),
	}
}

/**
 * A lot cut from the repository's first commit, before main added the package: its worktree commits one file of its
 * own, then main commits the package and its old splice, and the lot brings main in by `move` (a rebase onto main or a
 * merge of main). Its identity keeps the commit it was cut at, an ancestor of the commit main added; the test file is
 * then changed, not committed. `baseCommit` is main's package commit: where the lot now forks from main.
 */
export function createMovedLotWorktree(params: { move: LotWorktreeMove }): LotWorktree {
	const workspace = createBriefWorkspace()
	const cut = workspace.commit
	const root = addWorktreeFolder({ workspace, folderName: LOT_NAME })
	commitFiles({ root, files: { [LOT_BRANCH_FILE]: 'export {}\n' }, message: 'chore: lot note' })
	commitFiles({
		root: workspace.repository,
		files: { ...BASE_FILES.dialecte },
		message: 'chore: package',
	})
	const { commit: baseCommit, shortSha } = headIdsOf(workspace.repository)
	const moveArgs = {
		rebase: ['rebase', '-q', 'main'],
		merge: ['merge', '-q', '--no-edit', 'main'],
	}[params.move]
	git({ root, args: moveArgs })
	writeFiles({ root, files: { [TEST_FILE]: CHANGED_TEST_FILE } })
	const lotFolder = writeStoreLot({
		workspace,
		name: LOT_NAME,
		scope: ['src/'],
		base: { ref: 'main', commit: cut },
	})
	linkLot({ worktree: root, lotFolder })
	return { root, shortSha, baseCommit }
}

/**
 * A lot started on another lot (`stack.json`): main holds the package without the test file; the parent's branch,
 * cut from it, commits the test file with the old splice; the child's worktree is cut from the parent's tip and
 * commits one file of its own; main then moves on. Both identities keep main's package commit as their cut. `parent`
 * says whether the store holds the parent lot (`open`) or the stack names a lot it does not hold (`unreadable`). The
 * test file is changed in the child, not committed. `baseCommit` is the parent's tip: where the child forks from the
 * parent's line.
 */
export function createStackedLotWorktree(params: { parent: StackParentState }): LotWorktree {
	const workspace = createBriefWorkspace()
	const { repository } = workspace
	const { [TEST_FILE]: baseTestFile, ...packageFiles } = BASE_FILES.dialecte
	commitFiles({ root: repository, files: packageFiles, message: 'chore: package' })
	const mainCut = headIdsOf(repository).commit
	git({ root: repository, args: ['checkout', '-q', '-b', PARENT_BRANCH] })
	commitFiles({
		root: repository,
		files: { [TEST_FILE]: baseTestFile ?? '' },
		message: 'test: widget',
	})
	const { commit: baseCommit, shortSha } = headIdsOf(repository)
	const root = addWorktreeFolder({ workspace, folderName: LOT_NAME })
	git({ root: repository, args: ['checkout', '-q', 'main'] })
	commitFiles({ root, files: { [LOT_BRANCH_FILE]: 'export {}\n' }, message: 'chore: lot note' })
	commitFiles({
		root: repository,
		files: { [MAIN_BRANCH_FILE]: 'export {}\n' },
		message: 'chore: main note',
	})
	writeFiles({ root, files: { [TEST_FILE]: CHANGED_TEST_FILE } })
	const cutOnMain = { ref: 'main', commit: mainCut }
	if (params.parent === 'open')
		writeStoreLot({
			workspace,
			name: PARENT_LOT_NAME,
			scope: ['src/'],
			branch: PARENT_BRANCH,
			repository,
			base: cutOnMain,
		})
	const lotFolder = writeStoreLot({
		workspace,
		name: LOT_NAME,
		scope: ['src/'],
		repository,
		base: cutOnMain,
	})
	writeFileSync(
		join(lotFolder, STACK_FILE),
		`${JSON.stringify({ schema: STACK_SCHEMA, parent: PARENT_LOT_NAME })}\n`,
	)
	linkLot({ worktree: root, lotFolder })
	return { root, shortSha, baseCommit }
}
