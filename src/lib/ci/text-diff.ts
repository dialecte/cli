/** A unified diff of two texts, for the files `dialecte ci` reports. */
import { DIFF_CONTEXT } from './ci-template.constants.ts'

import type { DiffLine } from './ci-template.types.ts'

/** The diff lines from `before` (the repository) to `after` (the template); none when equal. */
export function unifiedDiff(params: { path: string; before: string; after: string }): string[] {
	const lines = diffLines({ before: linesOf(params.before), after: linesOf(params.after) })
	const hunks = hunkRangesOf(lines)
	if (hunks.length === 0) return []
	return [
		`--- ${params.path} (repository)`,
		`+++ ${params.path} (template)`,
		...hunks.flatMap((range) => hunkLines(lines.slice(range.start, range.end + 1))),
	]
}

/** The lines of a text; its final line feed ends the last line, it opens no empty one. */
function linesOf(text: string): string[] {
	if (text === '') return []
	const lines = text.split('\n')
	return lines.at(-1) === '' ? lines.slice(0, -1) : lines
}

/** Every line of both texts in order, kept, removed or added, from their longest common subsequence. */
function diffLines(params: { before: readonly string[]; after: readonly string[] }): DiffLine[] {
	const { before, after } = params
	const common = commonLengths({ before, after })
	const lines: DiffLine[] = []
	let oldIndex = 0
	let newIndex = 0
	while (oldIndex < before.length || newIndex < after.length) {
		const position = { oldNumber: oldIndex + 1, newNumber: newIndex + 1 }
		if (
			oldIndex < before.length &&
			newIndex < after.length &&
			before[oldIndex] === after[newIndex]
		) {
			lines.push({ kind: ' ', text: before[oldIndex], ...position })
			oldIndex += 1
			newIndex += 1
		} else if (
			newIndex >= after.length ||
			(oldIndex < before.length &&
				(common[oldIndex + 1]?.[newIndex] ?? 0) >= (common[oldIndex]?.[newIndex + 1] ?? 0))
		) {
			lines.push({ kind: '-', text: before[oldIndex], ...position })
			oldIndex += 1
		} else {
			lines.push({ kind: '+', text: after[newIndex], ...position })
			newIndex += 1
		}
	}
	return lines
}

/** `common[i][j]`: the longest common subsequence of `before` from i and `after` from j. */
function commonLengths(params: {
	before: readonly string[]
	after: readonly string[]
}): number[][] {
	const { before, after } = params
	const common = Array.from({ length: before.length + 1 }, () =>
		new Array<number>(after.length + 1).fill(0),
	)
	for (let oldIndex = before.length - 1; oldIndex >= 0; oldIndex -= 1)
		for (let newIndex = after.length - 1; newIndex >= 0; newIndex -= 1)
			common[oldIndex][newIndex] =
				before[oldIndex] === after[newIndex]
					? common[oldIndex + 1][newIndex + 1] + 1
					: Math.max(common[oldIndex + 1][newIndex], common[oldIndex][newIndex + 1])
	return common
}

/** The index ranges of the hunks: each change with its context, ranges that touch merged. */
function hunkRangesOf(lines: readonly DiffLine[]): { start: number; end: number }[] {
	return lines.reduce<{ start: number; end: number }[]>(function addChange(ranges, line, index) {
		if (line.kind === ' ') return ranges
		const range = {
			start: Math.max(0, index - DIFF_CONTEXT),
			end: Math.min(lines.length - 1, index + DIFF_CONTEXT),
		}
		const last = ranges.at(-1)
		if (last !== undefined && range.start <= last.end + 1)
			return [...ranges.slice(0, -1), { start: last.start, end: range.end }]
		return [...ranges, range]
	}, [])
}

/** One hunk: its header, then its lines. */
function hunkLines(lines: readonly DiffLine[]): string[] {
	const old = lines.filter((line) => line.kind !== '+')
	const added = lines.filter((line) => line.kind !== '-')
	const oldStart = old[0]?.oldNumber ?? (lines[0]?.oldNumber ?? 1) - 1
	const newStart = added[0]?.newNumber ?? (lines[0]?.newNumber ?? 1) - 1
	return [
		`@@ -${oldStart},${old.length} +${newStart},${added.length} @@`,
		...lines.map((line) => `${line.kind}${line.text}`),
	]
}
