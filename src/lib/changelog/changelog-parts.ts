/** One reader of a changelog's parts: the Unreleased part and each version's section, outside code fences. */
import {
	CODE_FENCE_PATTERN,
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
 * heading inside a code fence is text. A version heading's part is keyed by its bracketed token.
 *
 * @intent read a changelog's parts once for the release fold and the released-section check
 * @internal
 */
export function readChangelogParts(params: { text: string }): ChangelogParts {
	const lines = params.text.replace(/\r\n/g, '\n').split('\n')
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
 * For each line, whether it is outside a code fence (a heading there is a heading).
 *
 * @intent tell a changelog heading from text inside a code fence
 * @internal
 */
export function lineKinds(params: { lines: readonly string[] }): boolean[] {
	let fenced = false
	return params.lines.map(function outsideFence(line) {
		const outside = !fenced
		if (CODE_FENCE_PATTERN.test(line)) fenced = !fenced
		return outside
	})
}

/** Every line outside a fence where a part ends, and what it opens; the first Unreleased heading opens that part. */
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
