/**
 * A merge hand-over's `review/lot.diff`: the lot's own change against the lots file's `head`, read through a scratch
 * copy of the index so the repository's index, refs and working tree are never touched.
 */
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { readGit } from '../git.ts'
import {
	REVIEW_DIFF_CONFIG,
	REVIEW_DIFF_FILE,
	REVIEW_DIFF_FOLDER,
	REVIEW_DIFF_OPTIONS,
	REVIEW_INDEX_FOLDER_PREFIX,
} from './handover.constants.ts'

/** The path of the review diff of the hand-over `folder`. */
export function reviewDiffPathOf(folder: string): string {
	return join(folder, REVIEW_DIFF_FOLDER, REVIEW_DIFF_FILE)
}

/**
 * The lot's change in `root` against `head`: what is committed on top of it, staged, unstaged, and the untracked
 * files git would add (ignored ones left out), as one diff with no colour whatever the git config.
 */
export function readLotDiff(params: { root: string; head: string }): string {
	const { root } = params
	const index = readGit({
		root,
		args: ['rev-parse', '--path-format=absolute', '--git-path', 'index'],
	}).trim()
	const scratch = mkdtempSync(join(tmpdir(), REVIEW_INDEX_FOLDER_PREFIX))
	try {
		const copy = join(scratch, 'index')
		if (existsSync(index)) copyFileSync(index, copy)
		const environment = { GIT_INDEX_FILE: copy }
		// every change of the working tree, untracked files included, into the scratch index only
		readGit({ root, args: ['add', '--all', '--', '.'], environment })
		return readGit({
			root,
			args: [...REVIEW_DIFF_CONFIG, 'diff', '--cached', ...REVIEW_DIFF_OPTIONS, params.head, '--'],
			environment,
		})
	} finally {
		rmSync(scratch, { recursive: true, force: true })
	}
}

/** Writes the lot's change of `root` against `head` to the review diff of the hand-over `folder`; its path. */
export function writeReviewDiff(params: { folder: string; root: string; head: string }): string {
	const path = reviewDiffPathOf(params.folder)
	mkdirSync(join(params.folder, REVIEW_DIFF_FOLDER), { recursive: true })
	writeFileSync(path, readLotDiff({ root: params.root, head: params.head }))
	return path
}
