/** Scope entries of a brief: normalisation, the refusals of one entry, the literal part, the overlap rule. Pure. */
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
 * The lot path is inside the scope entry: the entry's literal part is a string prefix of it. The literal part loses
 * its trailing `/` as a lot path does (`src/b/**` holds the lot path `src/b`).
 */
export function isInsideEntry(params: { path: string; entry: string }): boolean {
	return params.path.startsWith(comparedLiteralOf(params.entry))
}

/** The scope entry is covered by the lot path: one of the path and the entry's literal part is a prefix of the other. */
export function coversEntry(params: { path: string; entry: string }): boolean {
	const literal = comparedLiteralOf(params.entry)
	return literal.startsWith(params.path) || params.path.startsWith(literal)
}

/** The literal part of an entry without its trailing `/`, as a normalised lot path is compared with it. */
function comparedLiteralOf(entry: string): string {
	return literalPartOf(entry).replace(TRAILING_SEPARATORS, '')
}
