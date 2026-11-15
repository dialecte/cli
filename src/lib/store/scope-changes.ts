/**
 * A started lot's scope changes (FIX-lot-scope): `scope-changes.jsonl` in the lot folder, read in file order, and the
 * effective scope - the brief's scope with each change applied - that every scope reader takes.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { appendLine } from '../events/write-event.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { matchesGlob } from '../tdd/match-glob.ts'
import { isInsideEntry, literalPartOf, normaliseScopeEntry } from './brief-scope.ts'
import {
	SCOPE_CHANGE_LINE_LIMIT,
	SCOPE_CHANGE_OPS,
	SCOPE_CHANGE_KEYS,
	SCOPE_CHANGE_SCHEMA,
	SCOPE_CHANGE_TEXTS,
	SCOPE_CHANGES_SEPARATOR,
	SCOPE_PATHS_SEPARATOR,
} from './scope-changes.constants.ts'
import { STORE_FILES } from './store.constants.ts'

import type { LotScope, ScopeChange, ScopeChangeOp, ScopeChanges } from './scope-changes.types.ts'

/**
 * The changes of the lot folder's `scope-changes.jsonl` in file order; a line that does not read as one is counted,
 * never read: no JSON, another schema, an unknown op, paths that are no non-empty list of texts, a key the schema does
 * not name, an add without `by` or `reason`, a drop with only one of them, an undo with either, a last line without
 * its line feed. No file: no change.
 */
export function readScopeChanges(params: { lotFolder: string }): ScopeChanges {
	let content: string
	try {
		content = readFileSync(scopeChangesFileOf(params), 'utf8')
	} catch {
		return { changes: [], unreadable: 0 }
	}
	const lines = content.split('\n')
	// the text after the last line feed is a line without its end: never trusted, even when it parses
	const torn = lines.pop()
	const changes: ScopeChange[] = []
	let unreadable = torn === undefined || torn === '' ? 0 : 1
	for (const text of lines) {
		if (text === '') continue
		const change = parseScopeChange({ text })
		if (change === undefined) unreadable += 1
		else changes.push(change)
	}
	return { changes, unreadable }
}

/**
 * The brief's scope with each change applied in order, each entry normalised: `add` appends the paths not already
 * there; `drop` removes the entries equal to a path or lying inside it (on path segments).
 */
export function effectiveScopeOf(params: {
	brief: readonly string[]
	changes: readonly ScopeChange[]
}): string[] {
	return params.changes.reduce<string[]>(function applied(scope, change) {
		if (change.op === 'add')
			return [...scope, ...change.paths.filter((path) => !scope.includes(path))]
		// an undo takes back exactly what its add appended; a drop also removes what lies inside its paths
		if (change.op === 'undo') return scope.filter((entry) => !change.paths.includes(entry))
		return scope.filter((entry) => !change.paths.some((path) => isDroppedBy({ entry, path })))
	}, params.brief.map(normaliseScopeEntry))
}

/**
 * The changes of a lot's scope in words, for `lot status` and the card: each drop `dropped <paths>` - `(by <who>)` when
 * it names who, `(by <who>: <reason>)` with `withReason` -, each add `added <paths> (by <who>)` - with `: <reason>` when
 * `withReason` -, each undo `undid the add of <paths>`, joined by `; `; an unreadable file says so; undefined when the
 * lot changed nothing.
 */
export function scopeChangesText(params: {
	scope: LotScope
	withReason: boolean
}): string | undefined {
	const { scope } = params
	if (scope.unreadable !== undefined)
		return fillMessage({
			template: SCOPE_CHANGE_TEXTS.unreadable,
			values: { count: String(scope.unreadable) },
		})
	if (scope.changes.length === 0) return undefined
	return scope.changes
		.map(function changeText(change) {
			const paths = change.paths.join(SCOPE_PATHS_SEPARATOR)
			if (change.op === 'drop')
				return fillMessage({
					template:
						change.by === undefined
							? SCOPE_CHANGE_TEXTS.dropped
							: params.withReason
								? SCOPE_CHANGE_TEXTS.droppedWithReason
								: SCOPE_CHANGE_TEXTS.droppedBy,
					values: { paths, by: change.by ?? '', reason: change.reason ?? '' },
				})
			if (change.op === 'undo')
				return fillMessage({ template: SCOPE_CHANGE_TEXTS.undone, values: { paths } })
			return fillMessage({
				template: params.withReason ? SCOPE_CHANGE_TEXTS.addedWithReason : SCOPE_CHANGE_TEXTS.added,
				values: { paths, by: change.by ?? '', reason: change.reason ?? '' },
			})
		})
		.join(SCOPE_CHANGES_SEPARATOR)
}

/**
 * Whether a drop of `path` removes the scope entry: the entry is the path, or the path is a literal folder or file the
 * entry lies inside (on path segments); a glob path removes only the entry it equals.
 */
export function isDroppedBy(params: { entry: string; path: string }): boolean {
	const { entry, path } = params
	if (entry === path) return true
	return literalPartOf(path) === path && isInsideEntry({ path: entry, entry: path })
}

/**
 * Whether the scope entry covers `path`, a file: the entry is the path, a literal entry (no glob) holding it on path
 * segments, or a glob entry matching it (never every file under the glob's literal folder, FIX-scope-narrow D2).
 */
export function isCoveredBy(params: { path: string; entry: string }): boolean {
	const { path, entry } = params
	if (entry === path) return true
	if (literalPartOf(entry) === entry) return isInsideEntry({ path, entry })
	return matchesGlob({ path, glob: entry })
}

/**
 * Appends the changes of one call to the lot folder's `scope-changes.jsonl` in one write, in order (a drop before the
 * adds that narrow it, FIX-scope-narrow D1); refused over the line limit.
 */
export function appendScopeChanges(params: {
	lotFolder: string
	changes: readonly ScopeChange[]
}): void {
	appendLine({
		file: scopeChangesFileOf(params),
		line: scopeChangesBufferOf(params),
		limit: SCOPE_CHANGE_LINE_LIMIT,
	})
}

/** The bytes the changes of one call are written as: each change's line, in order. */
export function scopeChangesBufferOf(params: { changes: readonly ScopeChange[] }): Buffer {
	return Buffer.concat(params.changes.map((change) => scopeChangeLineOf({ change })))
}

/** The bytes a change is written as: its JSON and a line feed, in UTF-8 (what the limit counts). */
function scopeChangeLineOf(params: { change: ScopeChange }): Buffer {
	return Buffer.from(`${JSON.stringify(params.change)}\n`, 'utf8')
}

/** The lot folder's `scope-changes.jsonl`. */
export function scopeChangesFileOf(params: { lotFolder: string }): string {
	return join(params.lotFolder, STORE_FILES.scopeChanges)
}

/** The change a line holds; undefined when it does not read as one. */
function parseScopeChange(params: { text: string }): ScopeChange | undefined {
	let value: unknown
	try {
		value = JSON.parse(params.text)
	} catch {
		return undefined
	}
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
	const { schema, at, op, paths, by, reason } = value as Record<string, unknown>
	if (schema !== SCOPE_CHANGE_SCHEMA || typeof at !== 'string' || !isScopeChangeOp(op))
		return undefined
	// the schema's shape: a non-empty list of texts, no key it does not name
	if (!Object.keys(value).every((key) => (SCOPE_CHANGE_KEYS as readonly string[]).includes(key)))
		return undefined
	if (
		!Array.isArray(paths) ||
		paths.length === 0 ||
		!paths.every((path) => typeof path === 'string')
	)
		return undefined
	if (op === 'undo')
		return by === undefined && reason === undefined
			? { schema: SCOPE_CHANGE_SCHEMA, at, op, paths: paths as string[] }
			: undefined
	// a drop names who and why since every drop requires them; an older drop line holds neither (FIX-scope-narrow D7)
	if (op === 'drop' && by === undefined && reason === undefined)
		return { schema: SCOPE_CHANGE_SCHEMA, at, op, paths: paths as string[] }
	if (typeof by !== 'string' || typeof reason !== 'string') return undefined
	return { schema: SCOPE_CHANGE_SCHEMA, at, op, paths: paths as string[], by, reason }
}

/** Whether a value is an op of a scope change. */
function isScopeChangeOp(value: unknown): value is ScopeChangeOp {
	return typeof value === 'string' && (SCOPE_CHANGE_OPS as readonly string[]).includes(value)
}
