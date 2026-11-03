/**
 * Lines a lot adds and removes: against HEAD while it waits, from its commit once committed; a merge lot
 * between the tree it merges on and the tree it holds, or its commit against its first parent.
 */
import { join } from 'node:path'

import { readGit } from '../git.ts'
import { readCommittedBytes } from './committed-bytes.ts'
import { SHORTSTAT_PATTERNS } from './handover.constants.ts'

import type { DiffSize, TreeDiffSize } from './handover.types.ts'

/** Lines added and removed by the lot's files against HEAD, a new file counted as all added. */
export function workingTreeSizeOf(params: {
	root: string
	files: string[]
	deletedFiles: string[]
}): DiffSize {
	const tracked = new Set(
		readGit({
			root: params.root,
			args: ['ls-files', '--', ...params.files, ...params.deletedFiles],
		})
			.split('\n')
			.filter(Boolean),
	)
	const trackedPaths = [...params.files, ...params.deletedFiles].filter((file) => tracked.has(file))
	const size = trackedPaths.length
		? sumNumstat(
				readGit({
					root: params.root,
					args: ['diff', '--numstat', '--no-renames', 'HEAD', '--', ...trackedPaths],
				}),
			)
		: { insertions: 0, deletions: 0 }
	for (const file of params.files.filter((path) => !tracked.has(path)))
		size.insertions += lineCountOf(readCommittedBytes(join(params.root, file)).toString('utf8'))
	return size
}

/** Lines a commit added and removed. */
export function commitSizeOf(params: { root: string; commit: string }): DiffSize {
	return sumNumstat(
		readGit({
			root: params.root,
			args: ['show', '--numstat', '--no-renames', '--format=', params.commit],
		}),
	)
}

/** Files changed and lines added and removed between two trees (or commits), as `git diff --shortstat` counts them. */
export function treeDiffSizeOf(params: { root: string; from: string; to: string }): TreeDiffSize {
	const shortstat = readGit({
		root: params.root,
		args: ['diff', '--shortstat', '--no-renames', params.from, params.to],
	})
	function countOf(pattern: RegExp): number {
		return Number(pattern.exec(shortstat)?.[1] ?? 0)
	}
	return {
		fileCount: countOf(SHORTSTAT_PATTERNS.files),
		insertions: countOf(SHORTSTAT_PATTERNS.insertions),
		deletions: countOf(SHORTSTAT_PATTERNS.deletions),
	}
}

function sumNumstat(numstat: string): DiffSize {
	const size = { insertions: 0, deletions: 0 }
	for (const line of numstat.split('\n').filter(Boolean)) {
		const [added, removed] = line.split('\t')
		size.insertions += Number(added) || 0
		size.deletions += Number(removed) || 0
	}
	return size
}

/** Lines as git counts them: a last line without its newline counts too. */
function lineCountOf(text: string): number {
	if (!text) return 0
	return text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
}
