/** One reader of a changelog's parts: the Unreleased part and each version's section, as CommonMark reads its headings. */
import {
	LINK_REFERENCE_PATTERN,
	OPAQUE_BLOCK_TYPES,
	UNRELEASED_HEADING_PATTERN,
	VERSION_HEADING_MARKUP,
	VERSION_HEADING_PATTERN,
	VERSION_KEY_PATTERN,
} from './changelog.constants.ts'
import { readMarkdownBlocks } from './markdown-blocks.ts'

import type {
	ChangelogPart,
	ChangelogParts,
	MarkdownBlocks,
	PartBoundary,
} from './changelog.types.ts'

/**
 * The lines of `text` (split as CommonMark splits them) and its parts in file order. The first Unreleased heading (any
 * casing, bracketed or not) opens the Unreleased part; any later `## [` heading (a version heading, or a second
 * bracketed Unreleased heading) ends the current part and opens its own; a link reference line ends the current part.
 * Headings are CommonMark's top-level ATX headings: one inside a fence, an HTML block, a list or a quote is text. An
 * HTML comment that never closes hides nothing (`readMarkdownBlocks`). A version heading's part is keyed by its bracketed token.
 *
 * @intent read a changelog's parts once for the release fold and the released-section check
 * @internal
 */
export function readChangelogParts(params: { text: string }): ChangelogParts {
	const blocks = readMarkdownBlocks({ text: params.text })
	const { lines } = blocks
	const boundaries = boundariesOf({ blocks })
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
 * Where a part ends and what it opens: each top-level level-2 ATX heading whose line is an Unreleased or `## [` heading
 * (the first Unreleased heading opens that part), and each link reference line no fence, code or HTML block holds.
 */
function boundariesOf(params: { blocks: MarkdownBlocks }): PartBoundary[] {
	const { lines, tokens } = params.blocks
	const headings = new Set(
		tokens
			.filter(
				(token) =>
					token.type === 'heading_open' &&
					token.level === 0 &&
					token.markup === VERSION_HEADING_MARKUP,
			)
			.map((token) => token.map?.[0]),
	)
	const opaque = tokens.flatMap(({ type, map }) =>
		OPAQUE_BLOCK_TYPES.includes(type) && map ? [map] : [],
	)
	const boundaries: PartBoundary[] = []
	for (const [index, line] of lines.entries()) {
		if (headings.has(index)) {
			const unreleased = UNRELEASED_HEADING_PATTERN.test(line)
			const unreleasedOpen = boundaries.some((boundary) => boundary.opens === 'unreleased')
			if (unreleased && !unreleasedOpen) boundaries.push({ index, opens: 'unreleased' })
			else if (VERSION_HEADING_PATTERN.test(line))
				boundaries.push({ index, opens: openedBy({ line }) })
		} else if (
			!opaque.some(([from, to]) => index >= from && index < to) &&
			LINK_REFERENCE_PATTERN.test(line)
		)
			boundaries.push({ index, opens: 'nothing' })
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
