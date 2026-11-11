/** Hand-overs written in scratch repositories for `handover review`: a plain one, and one holding a merge lot. */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { runHandover } from '../src/commands/handover.ts'
import { HANDOVER_FILES } from '../src/lib/handover/handover.constants.ts'
import { STORE_WRITER_CLI } from './handover-store-scenario.constants.ts'
import {
	createBranchRepository,
	entryNamesOf,
	headOf,
	readEntry,
	writeStoreHandover,
} from './handover-store-scenario.ts'
import { noRepositoryCli } from './repository-cli-probe.ts'
import {
	ADDED_CONTENT,
	ADDED_FILE,
	COMMITTED_CONTENT,
	COMMITTED_FILE,
	EDITED_AFTER,
	EDITED_BEFORE,
	EDITED_FILE,
	IGNORED_CONTENT,
	IGNORED_FILE,
	MERGE_BRANCH,
	NUMBERED_BRANCH,
	PLAIN_CHANGES,
	REVIEW_HANDOVER_NOW,
} from './review-handover.constants.ts'
import {
	createScratchRepository,
	git,
	isolateGitConfig,
	temporaryFolder,
	writeFiles,
} from './scratch-repository.ts'

import type { LotsFile, MergeLotPlan } from '../src/lib/handover/handover.types.ts'
import type { ReviewHandover } from './review-handover.types.ts'

/** The hand-over `root`'s store holds (the only entry), with the worktree its lots file names. */
export function readReviewHandover(params: { root: string }): ReviewHandover {
	const [name] = entryNamesOf(params.root)
	const entry = readEntry({ root: params.root, name })
	if (!entry) throw new Error(`no hand-over registered in ${params.root}`)
	const lotsFile = JSON.parse(
		readFileSync(join(entry.folder, HANDOVER_FILES.lots), 'utf8'),
	) as LotsFile
	return { root: params.root, name, folder: entry.folder, worktree: lotsFile.repository }
}

/**
 * A hand-over of one plain lot in a worktree whose folder is numbered (`<index>-repo-indexed`, so `handover review
 * <index>` finds it), written from the main checkout's store.
 */
export function writeNumberedReviewHandover(params: { index: string }): ReviewHandover {
	isolateGitConfig()
	const root = createBranchRepository()
	const worktree = join(
		temporaryFolder('dialecte-workspace-'),
		'.worktrees',
		`${params.index}-repo-indexed`,
	)
	git({ root, args: ['worktree', 'add', '-q', '-b', NUMBERED_BRANCH, worktree] })
	writeStoreHandover({
		root: worktree,
		name: 'numbered',
		changes: { ...PLAIN_CHANGES },
		now: REVIEW_HANDOVER_NOW,
	})
	return readReviewHandover({ root })
}

/** A hand-over of one plain lot in a repository on the default branch: no merge lot. */
export function writePlainReviewHandover(): ReviewHandover {
	isolateGitConfig()
	const root = createBranchRepository()
	writeStoreHandover({
		root,
		name: 'plain',
		changes: { ...PLAIN_CHANGES },
		now: REVIEW_HANDOVER_NOW,
	})
	return readReviewHandover({ root })
}

/**
 * A hand-over holding a plain lot and a merge lot, the lot's own change standing in the working tree: `notes.txt`
 * edited (tracked), `fresh.txt` added (untracked, named by the plain lot), and a file an ignore rule hides.
 */
export function writeMergeReviewHandover(): ReviewHandover {
	isolateGitConfig()
	const root = createScratchRepository({
		'conflict.txt': 'base\n',
		[EDITED_FILE]: EDITED_BEFORE,
		'.gitignore': 'node_modules\n',
	})
	git({ root, args: ['checkout', '-q', '-b', MERGE_BRANCH] })
	writeFiles({ root, files: { 'conflict.txt': 'feature\n' } })
	git({ root, args: ['commit', '-q', '-am', 'feat: the branch work'] })
	const tip = headOf(root)
	git({ root, args: ['checkout', '-q', 'main'] })
	writeFiles({ root, files: { 'conflict.txt': 'main\n' } })
	git({ root, args: ['commit', '-q', '-am', 'feat: the main work'] })
	writeFiles({
		root,
		files: {
			[EDITED_FILE]: EDITED_AFTER,
			[ADDED_FILE]: ADDED_CONTENT,
			[IGNORED_FILE]: IGNORED_CONTENT,
		},
	})
	const out = temporaryFolder('dialecte-review-handover-')
	writeFiles({ root: out, files: { 'resolved/conflict.txt': 'resolved\n' } })
	const mergeLot: MergeLotPlan = {
		kind: 'merge',
		branch: MERGE_BRANCH,
		tip,
		resolved: { 'conflict.txt': 'resolved/conflict.txt' },
		message: 'merge: bring the branch in',
	}
	const lotsPath = join(out, HANDOVER_FILES.lots)
	const lotsFile: LotsFile = {
		repository: root,
		branch: 'main',
		head: headOf(root),
		gates: 'npm run check',
		lots: [{ paths: [EDITED_FILE, ADDED_FILE], message: 'docs(notes): edited' }, mergeLot],
	}
	writeFileSync(lotsPath, JSON.stringify(lotsFile))
	const written = runHandover({
		argv: [lotsPath],
		cliPath: STORE_WRITER_CLI,
		probe: noRepositoryCli,
		now: REVIEW_HANDOVER_NOW,
	})
	if (written.exitCode !== 0) throw new Error(`could not write ${lotsPath}: ${written.output}`)
	// the lot's change is not all in the working tree: a file committed on top of `head` (HEAD is no longer `head`)
	// and the edit staged, so neither a bare `git diff` nor a diff against HEAD shows all of it
	writeFiles({ root, files: { [COMMITTED_FILE]: COMMITTED_CONTENT } })
	git({ root, args: ['add', COMMITTED_FILE] })
	git({ root, args: ['commit', '-q', '-m', 'docs: a lot change committed after head'] })
	git({ root, args: ['add', EDITED_FILE] })
	return readReviewHandover({ root })
}

/** Git colours every diff of `root` from now on, even into a file: a review diff must hold no colour code. */
export function forceGitColour(params: { root: string }): void {
	git({ root: params.root, args: ['config', 'color.ui', 'always'] })
}
