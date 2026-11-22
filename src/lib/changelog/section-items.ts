/** The top-level blocks of a changelog section's text: its bullet items and its other blocks. */
import { commentOpenedIn, lineKinds } from './changelog-parts.ts'
import {
	BREAKING_ITEM_PATTERN,
	BULLET_ITEM_PATTERN,
	ITEM_INTERRUPT_PATTERN,
} from './changelog.constants.ts'

import type { OpenBlock, SectionBlock } from './changelog.types.ts'

/**
 * The top-level blocks of one section's `text`, in the order written. A column-0 `- ` line outside a fence opens an
 * item; an indented or blank line continues the block it follows; a column-0 line right after an item line continues
 * it lazily, unless it is a fence, a heading, a quote or a rule; any other column-0 line after a blank line opens a
 * text block. A list of another kind is never cut into items; a fence or an HTML comment block is one block, nothing
 * inside it opening another; a comment indented to an item's content is that item's own.
 *
 * @intent cut a changelog section into the blocks a release orders and joins
 * @internal
 */
export function sectionItemsOf(params: { text: string }): SectionBlock[] {
	const lines = params.text.split('\n')
	const outside = lineKinds({ lines })
	const blocks: OpenBlock[] = []
	let afterBlank = false
	for (const [index, text] of lines.entries()) {
		const line = { text, outside: outside[index] ?? true }
		const current = blocks.at(-1)
		// a comment block of its own opens a text block; an item's own comment continues its item (one rule with
		// lineKinds, which keeps every line up to its close inside it)
		const opensIn = commentOpenedIn({ text, inItem: current?.kind === 'item' })
		const opens = !line.outside
			? undefined
			: opensIn === 'top'
				? 'text'
				: opensIn === 'item'
					? undefined
					: openedKind({ text, current, afterBlank })
		if (opens !== undefined) blocks.push({ kind: opens, lines: [line] })
		else if (current) current.lines.push(line)
		else if (text.trim() !== '') blocks.push({ kind: 'text', lines: [line] })
		afterBlank = line.outside && text.trim() === ''
	}
	return blocks.map(closedBlock)
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

/** The kind of block a line outside a fence opens, or undefined when it continues the current one. */
function openedKind(params: {
	text: string
	current: OpenBlock | undefined
	afterBlank: boolean
}): SectionBlock['kind'] | undefined {
	const { text, current, afterBlank } = params
	if (BULLET_ITEM_PATTERN.test(text)) return 'item'
	if (text.trim() === '' || /^\s/.test(text)) return undefined
	if (current === undefined || afterBlank) return 'text'
	return current.kind === 'item' && ITEM_INTERRUPT_PATTERN.test(text) ? 'text' : undefined
}

/** A block read: its text without trailing blank lines, whether it holds a blank line outside a fence, a marker. */
function closedBlock(block: OpenBlock): SectionBlock {
	const lines = [...block.lines]
	while (lines.length > 0 && lines.at(-1)?.text.trim() === '') lines.pop()
	const [first] = lines
	return {
		kind: block.kind,
		text: lines.map((line) => line.text).join('\n'),
		breaking: block.kind === 'item' && BREAKING_ITEM_PATTERN.test(first?.text ?? ''),
		multiBlock: lines.some((line) => line.outside && line.text.trim() === ''),
	}
}
