/** A lot worktree for the tests of `rules`: a package at a base commit, the worktree cut from it, both branches moved on, a change. */
import { writeHygieneBaseline } from '../src/lib/worktree/hygiene.ts'
import { createBriefWorkspace, writeStoreLot } from './brief-workspace.ts'
import { addWorktreeFolder, linkLot } from './lot-stores.ts'
import {
	BASE_FILES,
	CHANGED_TEST_FILE,
	LOT_BRANCH_FILE,
	LOT_NAME,
	MAIN_BRANCH_FILE,
	TEST_FILE,
} from './rules-lot-worktree.constants.ts'
import { git, writeFiles } from './scratch-repository.ts'

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

/**
 * The base commit holds the package and the old splice; the worktree is cut from it on its own branch, one unrelated
 * file is committed on the lot's branch and one on main (so the merge-base is neither tip), and the test file is then
 * changed, not committed. `source` says what the worktree holds to name its base.
 */
export function createLotWorktree(params: {
	source: LotWorktreeSource
	kind?: LotWorktreeKind
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
	const root = addWorktreeFolder({ workspace, folderName: LOT_NAME })
	commitFiles({ root, files: { [LOT_BRANCH_FILE]: 'export {}\n' }, message: 'chore: lot note' })
	commitFiles({
		root: workspace.repository,
		files: { [MAIN_BRANCH_FILE]: 'export {}\n' },
		message: 'chore: main note',
	})
	writeFiles({ root, files: { [TEST_FILE]: CHANGED_TEST_FILE } })
	const { source } = params
	if (source === 'link-and-baseline') git({ root, args: ['branch', 'side'] })
	const baselineFrom = {
		'hygiene-baseline': 'main',
		'hygiene-baseline-unreadable-from': 'no-such-branch',
		'link-and-baseline': 'side',
	}[source as string]
	if (baselineFrom !== undefined)
		writeHygieneBaseline({ root, now: new Date('2026-11-14T08:00:00.000Z'), from: baselineFrom })
	const linkedBase = {
		'lot-link': { ref: 'main', commit: baseCommit },
		'link-and-baseline': { ref: 'main', commit: baseCommit },
		'lot-link-commit-only': { ref: '', commit: baseCommit },
		'unreadable-ref-link': { ref: 'no-such-ref', commit: 'a'.repeat(40) },
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
	return { root, shortSha, baseCommit }
}
