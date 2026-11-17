/** One comparison of two commits by `git merge-tree --write-tree`, in memory, and the files both sides changed. */
import { basename } from 'node:path'

import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { firstLineOf, runBoundedGit } from './bounded-git.ts'
import { overTimeReason } from './forecast-reasons.ts'
import {
	CONFLICT_END_MARKER,
	CONFLICT_START_MARKER,
	CONFLICT_TYPE_PATTERN,
	CONTENT_CONFLICT_KIND,
	CONTENT_CONFLICT_TYPE,
	EXCLUSIVE_FILE_NAMES,
	FORECAST_REASONS,
	MERGE_TREE_UNPARSED,
	TREE_ID_PATTERN,
} from './forecast.constants.ts'

import type {
	BoundedGitResult,
	ComparisonOutcome,
	ConflictRange,
	ForecastConflict,
	MergeParams,
} from './forecast.types.ts'

/**
 * The comparison of `ours` and `theirs`: the conflicts merge-tree forecasts (with their kinds and, for a content
 * conflict, the line ranges between the markers of the merged file), the files both sides changed since their merge
 * base, and the verdict - `exclusive` when every conflicted path is an exclusive path, `conflict` for any other
 * conflict, else `clean`; `unknown` with the reason when a step fails or runs over its limit.
 */
export function compareCommits(params: MergeParams): ComparisonOutcome {
	const merged = mergeConflictsOf(params)
	if ('reason' in merged) return { verdict: 'unknown', reason: merged.reason }
	const shared = sharedFilesOf(params)
	if ('reason' in shared) return { verdict: 'unknown', reason: shared.reason }
	return { verdict: verdictOf(merged.conflicts), shared: shared.files, conflicts: merged.conflicts }
}

/** The verdict of a comparison's conflicts: clean for none, exclusive when every path is exclusive, else conflict. */
export function verdictOf(
	conflicts: readonly ForecastConflict[],
): 'clean' | 'conflict' | 'exclusive' {
	if (conflicts.length === 0) return 'clean'
	return conflicts.every((conflict) => EXCLUSIVE_FILE_NAMES.has(basename(conflict.path)))
		? 'exclusive'
		: 'conflict'
}

/** The conflicts of the merge of `ours` and `theirs`, git choosing the merge base; the reason when it cannot run. */
export function mergeConflictsOf(
	params: MergeParams,
): { conflicts: ForecastConflict[] } | { reason: string } {
	const { root, lot, limitMs } = params
	const result = runBoundedGit({
		root,
		args: [
			'merge-tree',
			'--write-tree',
			'-z',
			'--name-only',
			'--messages',
			params.ours,
			params.theirs,
		],
		limitMs,
	})
	if (result.timedOut) return { reason: overTimeReason({ lot, limitMs }) }
	if (result.status !== 0 && result.status !== 1)
		return { reason: mergeFailure(firstLineOf(result)) }
	const parsed = parseMergeTree(result.stdout)
	if (parsed === undefined) return { reason: mergeFailure(MERGE_TREE_UNPARSED) }
	const conflicts: ForecastConflict[] = []
	for (const path of parsed.paths) {
		const kind = parsed.kinds.get(path) ?? CONTENT_CONFLICT_KIND
		if (kind !== CONTENT_CONFLICT_KIND) {
			conflicts.push({ path, kind, lines: [] })
			continue
		}
		const blob = runBoundedGit({
			root,
			args: ['cat-file', '-p', `${parsed.tree}:${path}`],
			limitMs,
		})
		if (blob.timedOut) return { reason: overTimeReason({ lot, limitMs }) }
		if (blob.status !== 0) return { reason: mergeFailure(firstLineOf(blob)) }
		conflicts.push({ path, kind, lines: conflictRangesOf(blob.stdout) })
	}
	return { conflicts }
}

/**
 * merge-tree's `-z --name-only --messages` output: the tree, the conflicted paths up to an empty field, then the
 * messages (`<count>`, the paths, the type, the text); the kind of each conflicted path from its `CONFLICT (<kind>)`
 * message. Undefined when it does not read so.
 */
export function parseMergeTree(
	output: string,
): { tree: string; paths: string[]; kinds: Map<string, string> } | undefined {
	const fields = output.split('\0')
	const tree = fields[0] ?? ''
	if (!TREE_ID_PATTERN.test(tree)) return undefined
	let index = 1
	const paths: string[] = []
	while (index < fields.length && fields[index] !== '') {
		paths.push(fields[index] as string)
		index += 1
	}
	index += 1
	const kinds = new Map<string, string>()
	while (index < fields.length && fields[index] !== '') {
		const count = Number(fields[index])
		if (!Number.isInteger(count) || count < 0) return undefined
		const named = fields.slice(index + 1, index + 1 + count)
		const type = fields[index + 1 + count]
		if (type === undefined || fields[index + 2 + count] === undefined) return undefined
		const kind = CONFLICT_TYPE_PATTERN.exec(type)?.groups?.kind
		if (kind !== undefined)
			for (const path of named)
				if (!kinds.has(path))
					kinds.set(path, kind === CONTENT_CONFLICT_TYPE ? CONTENT_CONFLICT_KIND : kind)
		index += count + 3
	}
	return { tree, paths, kinds }
}

/** The line ranges (1-based, both ends included) from each start marker to its end marker in a merged file. */
export function conflictRangesOf(text: string): ConflictRange[] {
	const ranges: ConflictRange[] = []
	let start: number | undefined
	text.split('\n').forEach(function rangeOf(line, index) {
		if (start === undefined && line.startsWith(CONFLICT_START_MARKER)) start = index + 1
		else if (start !== undefined && line.startsWith(CONFLICT_END_MARKER)) {
			ranges.push([start, index + 1])
			start = undefined
		}
	})
	return ranges
}

/** The files both sides changed since their merge base, sorted; the reason when git cannot tell. */
function sharedFilesOf(params: MergeParams): { files: string[] } | { reason: string } {
	const { root, lot, limitMs } = params
	const base = runBoundedGit({ root, args: ['merge-base', params.ours, params.theirs], limitMs })
	if (base.timedOut) return { reason: overTimeReason({ lot, limitMs }) }
	// no common history: nothing is shared
	if (base.status === 1) return { files: [] }
	if (base.status !== 0) return { reason: diffFailure(base) }
	const from = base.stdout.trim()
	const changed: string[][] = []
	for (const commit of [params.ours, params.theirs]) {
		const diff = runBoundedGit({
			root,
			args: ['diff', '--name-only', '--no-renames', '-z', from, commit],
			limitMs,
		})
		if (diff.timedOut) return { reason: overTimeReason({ lot, limitMs }) }
		if (diff.status !== 0) return { reason: diffFailure(diff) }
		changed.push(diff.stdout.split('\0').filter((path) => path !== ''))
	}
	const theirs = new Set(changed[1])
	return { files: (changed[0] ?? []).filter((path) => theirs.has(path)).sort() }
}

/** `merge-tree failed: <message>`. */
function mergeFailure(message: string): string {
	return fillMessage({ template: FORECAST_REASONS.mergeTreeFailed, values: { message } })
}

/** `diff failed: <first line>`. */
function diffFailure(result: BoundedGitResult): string {
	return fillMessage({
		template: FORECAST_REASONS.diffFailed,
		values: { message: firstLineOf(result) },
	})
}
