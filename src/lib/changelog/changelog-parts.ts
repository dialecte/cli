/** One reader of a changelog's parts: the Unreleased part and each version's section, as CommonMark reads its headings. */
import {
	LINK_REFERENCE_PATTERN,
	UNRELEASED_TITLE_PATTERN,
	VERSION_HEADING_MARKUP,
	VERSION_TITLE_KEY_PATTERN,
	VERSION_TITLE_PATTERN,
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
 * bracketed Unreleased heading) ends the current part and opens its own; the link block at the end of the text ends the
 * last part (a link reference definition among entries ends nothing).
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
 * Where a part ends and what it opens: each top-level level-2 ATX heading whose text is an Unreleased title or opens
 * with a bracketed token (the first Unreleased heading opens that part), and the link block at the end of the text.
 */
function boundariesOf(params: { blocks: MarkdownBlocks }): PartBoundary[] {
	const { tokens } = params.blocks
	const boundaries: PartBoundary[] = []
	for (const [at, token] of tokens.entries()) {
		const index = token.map?.[0]
		if (token.type !== 'heading_open' || token.level !== 0 || index === undefined) continue
		if (token.markup !== VERSION_HEADING_MARKUP) continue
		const title = (tokens[at + 1]?.content ?? '').trim()
		const unreleased = UNRELEASED_TITLE_PATTERN.test(title)
		const unreleasedOpen = boundaries.some((boundary) => boundary.opens === 'unreleased')
		if (unreleased && !unreleasedOpen) boundaries.push({ index, opens: 'unreleased' })
		else if (VERSION_TITLE_PATTERN.test(title))
			boundaries.push({ index, opens: openedBy({ title }) })
	}
	const link = linkBlockLineOf(params)
	return link === undefined ? boundaries : [...boundaries, { index: link, opens: 'nothing' }]
}

/**
 * The first line of the link block: the first run of link reference definitions standing as top-level text (no block
 * token covers them: the parser consumes them) after the last version heading, after which only HTML blocks follow
 * (a closing comment); a definition inside an item's own paragraph belongs to the item, as CommonMark reads it.
 */
function linkBlockLineOf(params: { blocks: MarkdownBlocks }): number | undefined {
	const { lines, tokens } = params.blocks
	const top = tokens.filter((token) => token.level === 0 && token.nesting !== -1 && token.map)
	const lastHeading = top.filter((token) => token.type === 'heading_open').at(-1)?.map?.[0] ?? -1
	const first = lines.findIndex(
		(line, index) =>
			index > lastHeading &&
			!top.some(({ map }) => map !== null && index >= map[0] && index < map[1]) &&
			LINK_REFERENCE_PATTERN.test(line) &&
			top.every(({ type, map }) => map === null || map[0] < index || type === 'html_block'),
	)
	return first === -1 ? undefined : first
}

/** What a `## [` heading opens: a version's section keyed by its token, or (a second Unreleased heading) the Unreleased kind. */
function openedBy(params: { title: string }): PartBoundary['opens'] {
	const version = VERSION_TITLE_KEY_PATTERN.exec(params.title)?.[1]
	return version === undefined || UNRELEASED_TITLE_PATTERN.test(params.title)
		? 'unreleased'
		: { version }
}
