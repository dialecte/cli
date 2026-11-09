/**
 * Scope entries of a brief: normalisation, the refusals of one entry, the literal part, containment and coverage on
 * path segments, the overlap rule between lots (a string prefix). Pure.
 */
import {
	CURRENT_SEGMENT,
	EVERY_FILE_GLOB,
	FORBIDDEN_FIRST_SEGMENTS,
	GLOB_CHARACTER_PATTERN,
	PARENT_SEGMENT,
	SCOPE_SEPARATOR,
	TRAILING_SEPARATORS,
} from './brief.constants.ts'

/**
 * The entry with its `./` segments dropped, `//` collapsed and every trailing `/` dropped
 * (`./src//dataflow/` becomes `src/dataflow`).
 */
export function normaliseScopeEntry(entry: string): string {
	const absolute = entry.startsWith(SCOPE_SEPARATOR) ? SCOPE_SEPARATOR : ''
	const segments = entry
		.split(SCOPE_SEPARATOR)
		.filter((segment) => segment !== '' && segment !== CURRENT_SEGMENT)
	return `${absolute}${segments.join(SCOPE_SEPARATOR)}`.replace(TRAILING_SEPARATORS, '')
}

/**
 * Why the entry is refused as a scope entry (absolute, a `..` segment, under `.git` or `.dialecte`, a bare `**`,
 * `/`), tested after normalisation; undefined when it is well formed.
 */
export function scopeFaultOf(params: { entry: string }): string | undefined {
	if (params.entry.startsWith(SCOPE_SEPARATOR))
		return `${params.entry} is absolute: an entry is relative to the repository`
	const normalised = normaliseScopeEntry(params.entry)
	const segments = normalised.split(SCOPE_SEPARATOR)
	if (normalised === '') return `${params.entry} names the whole repository: name its folders`
	if (segments.includes(PARENT_SEGMENT))
		return `${params.entry} holds a .. segment: an entry stays inside the repository`
	if (FORBIDDEN_FIRST_SEGMENTS.includes(segments[0]))
		return `${params.entry} is under ${segments[0]}/: no lot writes there`
	if (normalised === EVERY_FILE_GLOB) return `${params.entry} names every file: name its folders`
	return undefined
}

/** Everything of a normalised entry before its first glob character (`*`, `?`, `[`, `{`, `(`, `!`). */
export function literalPartOf(entry: string): string {
	const glob = GLOB_CHARACTER_PATTERN.exec(entry)
	return glob ? entry.slice(0, glob.index) : entry
}

/**
 * Two normalised entries overlap when one literal part is a plain string prefix of the other (lower-cased when the
 * volume is case-insensitive).
 */
export function overlaps(params: { a: string; b: string; caseInsensitive: boolean }): boolean {
	const [first, second] = [literalPartOf(params.a), literalPartOf(params.b)].map((literal) =>
		params.caseInsensitive ? literal.toLowerCase() : literal,
	)
	return first.startsWith(second) || second.startsWith(first)
}

/**
 * The lot path is inside the scope entry, on path segments: the path is the entry's literal part (without its
 * trailing `/`) or lies below it (`lib/x` is inside `lib/`, `lib-other/x` and `libx` are not; `src/b/**` holds
 * `src/b`). A literal part cut inside a name by a glob (`src/data*`) is a plain string prefix of the path instead.
 */
export function isInsideEntry(params: { path: string; entry: string }): boolean {
	const literal = literalPartOf(params.entry)
	if (isCutInsideName({ entry: params.entry, literal })) return params.path.startsWith(literal)
	return isOnSegments({ path: params.path, folder: literal.replace(TRAILING_SEPARATORS, '') })
}

/**
 * The scope entry is covered by the lot path: the path is inside the entry, or the entry's literal part is inside
 * the path, on path segments; a literal part cut inside a name by a glob covers by plain string prefix, either way.
 */
export function coversEntry(params: { path: string; entry: string }): boolean {
	const literal = literalPartOf(params.entry)
	if (isCutInsideName({ entry: params.entry, literal }))
		return literal.startsWith(params.path) || params.path.startsWith(literal)
	const folder = literal.replace(TRAILING_SEPARATORS, '')
	return (
		isOnSegments({ path: params.path, folder }) ||
		isOnSegments({ path: folder, folder: params.path })
	)
}

/** The entry's glob cut its literal part inside a name: the character before the cut is not a `/`. */
function isCutInsideName(params: { entry: string; literal: string }): boolean {
	return (
		params.literal !== params.entry &&
		params.literal !== '' &&
		!params.literal.endsWith(SCOPE_SEPARATOR)
	)
}

/** `path` is `folder` or lies below it (an empty folder is the repository: it holds every path). */
function isOnSegments(params: { path: string; folder: string }): boolean {
	return (
		params.folder === '' ||
		params.path === params.folder ||
		params.path.startsWith(`${params.folder}${SCOPE_SEPARATOR}`)
	)
}
