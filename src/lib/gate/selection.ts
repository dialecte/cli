/**
 * The selection of a scoped gate step: the changed file the cli writes for it, the selection file it writes back,
 * read and checked (schema, ids, reasons, size), then held against the run's base, tree and count.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'

import { counted } from '../counted.ts'
import { SHORT_SHA_LENGTH } from '../gate-records/gate-records.constants.ts'
import { readGitBytes } from '../git.ts'
import {
	CHANGED_FILE_NAME,
	GATE_SCOPE_FOLDER_PREFIX,
	INVALID_SELECTION_REASON,
	INVALID_SELECTION_WHY,
	NO_IDS,
	NOTHING_SELECTED_NOTE,
	NUL_BYTE,
	LEADING_CURRENT_FOLDER_PATTERN,
	PARENT_SEGMENT,
	REPEATED_SLASHES_PATTERN,
	OTHER_BASE_OR_TREE_REASON,
	OTHER_CHANGED_COUNT_REASON,
	RERUN_OTHER_IDS_REASON,
	SELECTION_FILE_NAME,
	SELECTION_ID_PATTERN,
	SELECTION_MAX_BYTES,
	SELECTION_REASONS_SHOWN,
	SELECTION_SCHEMA,
} from './selection.constants.ts'

import type { GateScope, ReadSelection, ScopeRun, StepSelection } from './gate.types.ts'

/**
 * Makes the run's temporary folder (outside the package) and writes its changed file: the paths of
 * `git diff --name-only -z --no-renames <base> <tree>` (a rename is its two paths), raw, byte-sorted,
 * each followed by a NUL. The caller removes the folder (`removeScopeRun`) once the run returns.
 */
export function createScopeRun(params: { root: string; scope: GateScope }): ScopeRun {
	const { base, tree } = params.scope
	// bytes, never decoded: a path that is no UTF-8 reaches the step as git wrote it
	const paths = splitNulSeparated(
		readGitBytes({
			root: params.root,
			args: ['diff', '--name-only', '-z', '--no-renames', base, tree],
		}),
	).sort(Buffer.compare)
	const folder = mkdtempSync(join(tmpdir(), GATE_SCOPE_FOLDER_PREFIX))
	const changedFile = join(folder, CHANGED_FILE_NAME)
	writeFileSync(
		changedFile,
		Buffer.concat(paths.flatMap((path) => [path, Buffer.from([NUL_BYTE])])),
	)
	let selections = 0
	return {
		base,
		tree,
		folder,
		changedFile,
		changedCount: paths.length,
		nextSelectionPath: function nextSelectionPath() {
			selections += 1
			return join(folder, SELECTION_FILE_NAME.replace('{index}', String(selections)))
		},
	}
}

/** The non-empty entries of a NUL-separated byte list, each as its bytes. */
function splitNulSeparated(bytes: Buffer): Buffer[] {
	const entries: Buffer[] = []
	let start = 0
	for (let end = bytes.indexOf(NUL_BYTE); end !== -1; end = bytes.indexOf(NUL_BYTE, start)) {
		if (end > start) entries.push(bytes.subarray(start, end))
		start = end + 1
	}
	if (start < bytes.length) entries.push(bytes.subarray(start))
	return entries
}

/** Removes the run's temporary folder: its changed file and every selection path. */
export function removeScopeRun(scopeRun: ScopeRun): void {
	rmSync(scopeRun.folder, { recursive: true, force: true })
}

/**
 * The selection at `path` held against the run: valid (`readSelectionFile`), then of the run's base and tree,
 * then of its count; the selection as a result keeps it (at most 20 reasons per id shown) with the files it
 * declares failing, or why it fails.
 */
export function judgeSelection(params: {
	path: string
	scopeRun: ScopeRun
}): { selection: StepSelection; failing: string[] } | { reason: string } {
	const { scopeRun } = params
	const read = readSelectionFile(params.path)
	if ('why' in read) return { reason: INVALID_SELECTION_REASON.replace('{why}', read.why) }
	const { selection } = read
	if (selection.base !== scopeRun.base || selection.tree !== scopeRun.tree)
		return { reason: OTHER_BASE_OR_TREE_REASON }
	if (selection.changed !== scopeRun.changedCount)
		return {
			reason: OTHER_CHANGED_COUNT_REASON.replace('{judged}', String(selection.changed)).replace(
				'{handed}',
				String(scopeRun.changedCount),
			),
		}
	return {
		selection: {
			base: selection.base,
			tree: selection.tree,
			changed: selection.changed,
			ids: selection.selected.map((entry) => entry.id),
			reasons: Object.fromEntries(
				selection.selected.map(function shownReasons(entry) {
					return [
						entry.id,
						{
							shown: entry.reasons.slice(0, SELECTION_REASONS_SHOWN),
							more: Math.max(0, entry.reasons.length - SELECTION_REASONS_SHOWN),
						},
					]
				}),
			),
			skipped: selection.skipped,
		},
		failing: selection.failing,
	}
}

/** The note of a scoped step that selected nothing: the short base and how many paths changed. */
export function nothingSelectedNote(selection: StepSelection): string {
	return NOTHING_SELECTED_NOTE.replace('{base}', selection.base.slice(0, SHORT_SHA_LENGTH)).replace(
		'{paths}',
		counted({ count: selection.changed, noun: 'path' }),
	)
}

/** Why a rerun's ids differ from the first run's (compared as sets), or undefined when they are the same. */
export function rerunIdsMismatch(params: { first: string[]; rerun: string[] }): string | undefined {
	const first = new Set(params.first)
	const rerun = new Set(params.rerun)
	if (first.size === rerun.size && [...first].every((id) => rerun.has(id))) return undefined
	return RERUN_OTHER_IDS_REASON.replace('{rerun}', idList(params.rerun)).replace(
		'{first}',
		idList(params.first),
	)
}

function idList(ids: string[]): string {
	return ids.length ? ids.join(', ') : NO_IDS
}

/** The selection file at `path`, read and checked; or why it is not valid. Never throws. */
function readSelectionFile(path: string): { selection: ReadSelection } | { why: string } {
	if (!existsSync(path)) return { why: INVALID_SELECTION_WHY.missing }
	const bytes = statSync(path).size
	if (bytes > SELECTION_MAX_BYTES)
		return { why: INVALID_SELECTION_WHY.tooLarge.replace('{bytes}', String(bytes)) }
	let parsed: unknown
	try {
		parsed = JSON.parse(readFileSync(path, 'utf8'))
	} catch {
		return { why: INVALID_SELECTION_WHY.unreadable }
	}
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
		return { why: INVALID_SELECTION_WHY.notAnObject }
	const schema = 'schema' in parsed ? parsed.schema : undefined
	if (schema !== SELECTION_SCHEMA)
		return {
			why: INVALID_SELECTION_WHY.schema.replace('{schema}', JSON.stringify(schema) ?? 'none'),
		}
	const base = 'base' in parsed ? parsed.base : undefined
	const tree = 'tree' in parsed ? parsed.tree : undefined
	if (typeof base !== 'string' || typeof tree !== 'string')
		return { why: INVALID_SELECTION_WHY.baseOrTree }
	const changed = 'changed' in parsed ? parsed.changed : undefined
	if (typeof changed !== 'number' || !Number.isInteger(changed) || changed < 0)
		return { why: INVALID_SELECTION_WHY.changed }
	const selected = readEntries({
		field: 'selected',
		value: 'selected' in parsed ? parsed.selected : undefined,
	})
	if ('why' in selected) return selected
	const skipped = readEntries({
		field: 'skipped',
		value: 'skipped' in parsed ? parsed.skipped : undefined,
	})
	if ('why' in skipped) return skipped
	const seen = new Set<string>()
	const selectedEntries: ReadSelection['selected'] = []
	for (const entry of selected.entries) {
		const id = readId({ entry, seen })
		if (typeof id !== 'string') return id
		const reasons = 'reasons' in entry ? entry.reasons : undefined
		if (!Array.isArray(reasons) || reasons.length === 0)
			return { why: INVALID_SELECTION_WHY.noReason.replace('{id}', JSON.stringify(id)) }
		const texts = reasons.filter((reason): reason is string => typeof reason === 'string')
		if (texts.length !== reasons.length)
			return { why: INVALID_SELECTION_WHY.reasonNotString.replace('{id}', JSON.stringify(id)) }
		selectedEntries.push({ id, reasons: texts })
	}
	const skippedEntries: ReadSelection['skipped'] = []
	for (const entry of skipped.entries) {
		const id = readId({ entry, seen })
		if (typeof id !== 'string') return id
		const reason = 'reason' in entry ? entry.reason : undefined
		if (typeof reason !== 'string' || reason === '')
			return { why: INVALID_SELECTION_WHY.noReason.replace('{id}', JSON.stringify(id)) }
		skippedEntries.push({ id, reason })
	}
	const failing = readDeclaredFailing('failing' in parsed ? parsed.failing : [])
	if (failing === undefined) return { why: INVALID_SELECTION_WHY.failing }
	return {
		selection: {
			base,
			tree,
			changed,
			selected: selectedEntries,
			skipped: skippedEntries,
			failing,
		},
	}
}

/**
 * The optional `failing` list of a selection, each path normalised (`normalizeDeclaredPath`) and once: relative to
 * the package root, non-empty, not absolute, no `..` segment, no backslash; undefined when it is no such list.
 */
function readDeclaredFailing(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined
	const list: unknown[] = value
	const paths = list
		.filter((path): path is string => typeof path === 'string')
		.map(normalizeDeclaredPath)
	if (paths.length !== list.length || !paths.every(isPackagePath)) return undefined
	return [...new Set(paths)]
}

/** A declared path as the output names it: repeated `/` collapsed, a leading `./` dropped (`./` alone: empty). */
function normalizeDeclaredPath(path: string): string {
	return path.replace(REPEATED_SLASHES_PATTERN, '/').replace(LEADING_CURRENT_FOLDER_PATTERN, '')
}

/** A path relative to the package root, as vitest names a test file: non-empty, not absolute, no `..`, no backslash. */
function isPackagePath(path: string): boolean {
	return (
		path !== '' &&
		!isAbsolute(path) &&
		!path.includes('\\') &&
		!path.split('/').includes(PARENT_SEGMENT)
	)
}

/** The id of an entry, valid and not `seen` in either list yet (then added to it); or why not. */
function readId(params: { entry: object; seen: Set<string> }): string | { why: string } {
	const id = 'id' in params.entry ? params.entry.id : undefined
	if (typeof id !== 'string' || !SELECTION_ID_PATTERN.test(id))
		return { why: INVALID_SELECTION_WHY.invalidId.replace('{id}', JSON.stringify(id) ?? 'none') }
	if (params.seen.has(id))
		return { why: INVALID_SELECTION_WHY.duplicateId.replace('{id}', JSON.stringify(id)) }
	params.seen.add(id)
	return id
}

/** A list field of the selection, each entry an object; or why not. */
function readEntries(params: {
	field: 'selected' | 'skipped'
	value: unknown
}): { entries: object[] } | { why: string } {
	if (!Array.isArray(params.value))
		return { why: INVALID_SELECTION_WHY.notAList.replace('{field}', params.field) }
	const list: unknown[] = params.value
	const entries: object[] = []
	for (const entry of list) {
		if (typeof entry !== 'object' || entry === null || Array.isArray(entry))
			return { why: INVALID_SELECTION_WHY.notAnEntry.replace('{field}', params.field) }
		entries.push(entry)
	}
	return { entries }
}
