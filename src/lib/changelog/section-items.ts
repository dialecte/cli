/** The top-level blocks of a changelog section's text, as CommonMark reads them: its `- ` items and its other blocks. */
import { BREAKING_ITEM_PATTERN } from './changelog.constants.ts'
import { isMovableList, readMarkdownBlocks } from './markdown-blocks.ts'

import type { BreakingFirst, MarkdownToken, SectionBlock } from './changelog.types.ts'

/**
 * The top-level blocks of one section's `text`, in the order written, read from CommonMark's block tokens and sliced
 * from the author's own lines. A `- ` bullet list gives one `item` per list item; every other top-level block (a
 * paragraph, a heading, a fence, indented code, an HTML block, a rule, a quote, an ordered list, a `*` or `+` list) is
 * one `text` block, never cut. Each run of non-blank lines no block covers (a link reference definition) is a `text`
 * block in place: no text is dropped. An item is multi-block when a blank line stands before one of its direct child
 * blocks after the first; it is breaking when its first line opens with a breaking marker.
 *
 * @intent cut a changelog section into the blocks a release orders and joins
 * @internal
 */
export function sectionItemsOf(params: { text: string }): SectionBlock[] {
	const { lines, tokens } = readMarkdownBlocks({ text: params.text, scanHtml: false })
	const blocks: SectionBlock[] = []
	let covered = 0
	for (const [index, token] of tokens.entries()) {
		if (token.level !== 0 || token.nesting === -1 || !token.map) continue
		blocks.push(...uncoveredBlocks({ lines, from: covered, to: token.map[0] }))
		blocks.push(...blocksOfToken({ lines, tokens, index }))
		covered = token.map[1]
	}
	blocks.push(...uncoveredBlocks({ lines, from: covered, to: lines.length }))
	return blocks
}

/**
 * The blocks of a section joined as a formatter leaves them: one blank line after a multi-block block and around a
 * text block, one line feed between two one-block items.
 *
 * @intent write a section's blocks back as formatter-clean text
 * @internal
 */
export function joinBlocks(params: { blocks: readonly SectionBlock[] }): string {
	return params.blocks
		.map(function blockWithSeparator(block, index) {
			const before = params.blocks[index - 1]
			if (before === undefined) return block.text
			const loose = before.multiBlock || before.kind === 'text' || block.kind === 'text'
			return `${loose ? '\n\n' : '\n'}${block.text}`
		})
		.join('')
}

/**
 * A section's blocks with its breaking items first, every other block after them, each group in the order written,
 * joined as a formatter leaves them; or, when the joined text reads otherwise (a block indented enough to join the item
 * placed before it), the first block the joined text does not hold as one of its blocks or the start of one, and the
 * block placed before it.
 *
 * @intent order a changelog section's blocks breaking first without changing how any block reads
 * @internal
 */
export function breakingFirst(params: { blocks: readonly SectionBlock[] }): BreakingFirst {
	const ordered = [
		...params.blocks.filter((block) => block.breaking),
		...params.blocks.filter((block) => !block.breaking),
	]
	const text = joinBlocks({ blocks: ordered })
	const read = sectionItemsOf({ text })
	const same =
		read.length === ordered.length &&
		read.every(
			(block, index) => block.kind === ordered[index]?.kind && block.text === ordered[index]?.text,
		)
	if (same) return { text }
	const at = ordered.findIndex((block) => !read.some((other) => other.text.startsWith(block.text)))
	const index =
		at === -1 ? ordered.findIndex((block, place) => read[place]?.text !== block.text) : at
	const moved = ordered[index]
	return moved === undefined ? { text } : { moved, after: ordered[index - 1] }
}

/** The blocks one top-level token gives: an item per list item of a `- ` list, else one text block. */
function blocksOfToken(params: {
	lines: readonly string[]
	tokens: readonly MarkdownToken[]
	index: number
}): SectionBlock[] {
	const { lines, tokens, index } = params
	const token = tokens[index]
	if (!token?.map) return []
	if (!isMovableList({ token })) return [textBlock({ lines, from: token.map[0], to: token.map[1] })]
	const items: SectionBlock[] = []
	for (let at = index + 1; at < tokens.length; at += 1) {
		const item = tokens[at]
		if (item === undefined || (item.type === 'bullet_list_close' && item.level === 0)) break
		if (item.type !== 'list_item_open' || item.level !== 1 || !item.map) continue
		const text = sliceOf({ lines, from: item.map[0], to: item.map[1] })
		items.push({
			kind: 'item',
			text,
			breaking: BREAKING_ITEM_PATTERN.test(text.split('\n')[0] ?? ''),
			multiBlock: isMultiBlock({ lines, tokens, itemAt: at }),
		})
	}
	return items
}

/** Whether a blank line stands before a direct child block of the item at `itemAt`, the first child aside. */
function isMultiBlock(params: {
	lines: readonly string[]
	tokens: readonly MarkdownToken[]
	itemAt: number
}): boolean {
	const { lines, tokens, itemAt } = params
	const starts: number[] = []
	for (let at = itemAt + 1; at < tokens.length; at += 1) {
		const child = tokens[at]
		if (child === undefined || (child.type === 'list_item_close' && child.level === 1)) break
		if (child.level === 2 && child.nesting !== -1 && child.map) starts.push(child.map[0])
	}
	return starts.slice(1).some((start) => lines[start - 1]?.trim() === '')
}

/** One text block per run of non-blank lines from `from` to `to` (excluded): the lines no block token covers. */
function uncoveredBlocks(params: {
	lines: readonly string[]
	from: number
	to: number
}): SectionBlock[] {
	const blocks: SectionBlock[] = []
	let start = params.from
	for (let at = params.from; at <= params.to; at += 1) {
		if (at < params.to && params.lines[at]?.trim() !== '') continue
		if (at > start) blocks.push(textBlock({ lines: params.lines, from: start, to: at }))
		start = at + 1
	}
	return blocks
}

/** A text block of the lines from `from` to `to` (excluded). */
function textBlock(params: { lines: readonly string[]; from: number; to: number }): SectionBlock {
	return { kind: 'text', text: sliceOf(params), breaking: false, multiBlock: false }
}

/** The lines from `from` to `to` (excluded), joined, without trailing blank lines. */
function sliceOf(params: { lines: readonly string[]; from: number; to: number }): string {
	let to = params.to
	while (to > params.from && params.lines[to - 1]?.trim() === '') to -= 1
	return params.lines.slice(params.from, to).join('\n')
}
