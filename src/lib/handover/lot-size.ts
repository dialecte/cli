/** Lines a lot adds and removes: against HEAD while it waits, from its commit once committed. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { readGit } from '../git.ts'

import type { DiffSize } from './handover.types.ts'

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
		size.insertions += lineCountOf(readFileSync(join(params.root, file), 'utf8'))
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
