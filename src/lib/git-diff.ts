import { DIFF_HUNK, DIFF_NEW_PATH } from './git-diff.constants.ts'

import type { LineRange } from './git-diff.types.ts'

/**
 * The lines each file of a `git diff -U0` text gains, as ranges per path (paths unquoted); a file the diff touches
 * without adding a line holds no range, a deleted file is left out (a hunk that only deletes adds none).
 */
export function addedLineRangesOf(params: { diff: string }): Map<string, LineRange[]> {
	const ranges = new Map<string, LineRange[]>()
	let fileRanges: LineRange[] | undefined
	let previous = ''
	for (const line of params.diff.split('\n')) {
		// a file header follows its `--- ` line: an added line starting with `++ ` is content
		if (previous.startsWith('--- ') && line.startsWith('+++ ')) {
			fileRanges = undefined
			if (line.startsWith(DIFF_NEW_PATH)) {
				const path = line.slice(DIFF_NEW_PATH.length).replace(/\t$/, '')
				fileRanges = ranges.get(path) ?? []
				ranges.set(path, fileRanges)
			}
		} else {
			const hunk = DIFF_HUNK.exec(line)
			const count = hunk?.[2] === undefined ? 1 : Number(hunk[2])
			if (fileRanges && hunk && count > 0)
				fileRanges.push({ start: Number(hunk[1]), end: Number(hunk[1]) + count - 1 })
		}
		previous = line
	}
	return ranges
}
