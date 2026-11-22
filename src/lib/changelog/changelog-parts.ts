/** One reader of a changelog's parts: the Unreleased part and each version's section, outside code fences and HTML comments. */
import {
	CODE_FENCE_PATTERN,
	CRLF_PATTERN,
	HTML_COMMENT_CLOSE,
	HTML_COMMENT_CLOSE_FROM,
	HTML_COMMENT_OPEN,
	LINK_REFERENCE_PATTERN,
	UNRELEASED_HEADING_PATTERN,
	VERSION_HEADING_PATTERN,
	VERSION_KEY_PATTERN,
} from './changelog.constants.ts'

import type { ChangelogPart, ChangelogParts, PartBoundary } from './changelog.types.ts'

/**
 * The lines of `text` (CRLF read as LF) and its parts in file order. The first Unreleased heading (any casing,
 * bracketed or not) opens the Unreleased part; any later `## [` line (a version heading, or a second bracketed
 * Unreleased heading) ends the current part and opens its own; a link reference line ends the current part. A
 * heading inside a code fence or a column-0 HTML comment is text. A version heading's part is keyed by its bracketed token.
 *
 * @intent read a changelog's parts once for the release fold and the released-section check
 * @internal
 */
export function readChangelogParts(params: { text: string }): ChangelogParts {
	const lines = params.text.replace(CRLF_PATTERN, '\n').split('\n')
	const boundaries = boundariesOf({ lines })
	const parts = boundaries.flatMap(function partOf(boundary, position): ChangelogPart[] {
		const end = boundaries[position + 1]?.index ?? lines.length
		if (boundary.opens === 'nothing') return []
		if (boundary.opens === 'unreleased')
			return [{ kind: 'unreleased', heading: boundary.index, end }]
		return [{ kind: 'version', version: boundary.opens.version, heading: boundary.index, end }]
	})
	const link = boundaries.find((boundary) => boundary.opens === 'nothing')
	return { lines, parts, linkLine: link?.index }
}

/**
 * For each line, whether it is outside a code fence and a column-0 HTML comment (a heading there is a heading): the
 * line opening one is outside, the lines up to and including its close are not. A fence closes on its own character,
 * at least as long; a comment on `-->`. A comment that never closes hides nothing: its opening line is read as text.
 *
 * @intent tell a changelog heading from text inside a code fence or an HTML comment
 * @internal
 */
export function lineKinds(params: { lines: readonly string[] }): boolean[] {
	const unclosed = new Set<number>()
	for (;;) {
		const read = readLineKinds({ lines: params.lines, unclosed })
		if (read.openComment === undefined) return read.kinds
		unclosed.add(read.openComment)
	}
}

// dialecte-allow duplicate-read: lineKinds' one pass, rerun by it until no comment is left open
/**
 * The line kinds, the comment openings in `unclosed` read as text; `openComment` the line of a comment still open at
 * the end, if any.
 */
function readLineKinds(params: { lines: readonly string[]; unclosed: ReadonlySet<number> }): {
	kinds: boolean[]
	openComment: number | undefined
} {
	let open: string | undefined
	let openComment: number | undefined
	const kinds = params.lines.map(function outsideFenceOrComment(line, index) {
		const outside = open === undefined
		if (open === HTML_COMMENT_OPEN) {
			if (line.includes(HTML_COMMENT_CLOSE)) open = undefined
			return outside
		}
		if (outside && line.startsWith(HTML_COMMENT_OPEN) && !params.unclosed.has(index)) {
			// the close may follow on the opening line itself: <!-->, <!---> and <!-- x --> close there
			if (!line.includes(HTML_COMMENT_CLOSE, HTML_COMMENT_CLOSE_FROM)) {
				open = HTML_COMMENT_OPEN
				openComment = index
			}
			return outside
		}
		const marker = CODE_FENCE_PATTERN.exec(line)?.[1]
		if (marker === undefined) return outside
		if (open === undefined) open = marker
		else if (closesFence({ line, marker, open })) open = undefined
		return outside
	})
	return { kinds, openComment: open === HTML_COMMENT_OPEN ? openComment : undefined }
}

/**
 * Whether a fence line closes the fence `open` started: the same character, at least as long, nothing after it.
 */
function closesFence(params: { line: string; marker: string; open: string }): boolean {
	const { line, marker, open } = params
	return marker[0] === open[0] && marker.length >= open.length && line.trim() === marker
}

/** Every line outside a fence or a comment where a part ends, and what it opens; the first Unreleased heading opens that part. */
function boundariesOf(params: { lines: readonly string[] }): PartBoundary[] {
	const outside = lineKinds(params)
	const boundaries: PartBoundary[] = []
	for (const [index, line] of params.lines.entries()) {
		if (!outside[index]) continue
		const unreleased = UNRELEASED_HEADING_PATTERN.test(line)
		const unreleasedOpen = boundaries.some((boundary) => boundary.opens === 'unreleased')
		if (unreleased && !unreleasedOpen) boundaries.push({ index, opens: 'unreleased' })
		else if (VERSION_HEADING_PATTERN.test(line))
			boundaries.push({ index, opens: openedBy({ line }) })
		else if (LINK_REFERENCE_PATTERN.test(line)) boundaries.push({ index, opens: 'nothing' })
	}
	return boundaries
}

/** What a `## [` line opens: a version's section keyed by its token, or (a second Unreleased heading) the Unreleased kind. */
function openedBy(params: { line: string }): PartBoundary['opens'] {
	const version = VERSION_KEY_PATTERN.exec(params.line)?.[1]
	return version === undefined || UNRELEASED_HEADING_PATTERN.test(params.line)
		? 'unreleased'
		: { version }
}
