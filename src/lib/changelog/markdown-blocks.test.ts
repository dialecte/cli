/** A changelog text read as CommonMark blocks: the unclosed comment and the unclosed block a release refuses. */
import { readMarkdownBlocks } from './markdown-blocks.ts'

import { describe, expect, it } from 'vitest'

describe('readMarkdownBlocks', () => {
	it.each([
		{ label: 'a comment opener indented by three spaces', text: '   <!--\nx\n', line: 0 },
		{
			label: 'a tab-indented comment opener inside an item',
			text: '- a\n\n\t<!--\n- b\n',
			line: 2,
		},
		{ label: 'a comment opener inside a div block', text: '<div>\n<!--\n</div>\n', line: 0 },
		{
			label: 'a closed comment then an open one on its line',
			text: '<!-- a --> <!-- b\n',
			line: 0,
		},
		{
			label: 'a comment opened under an item, ended by its item',
			text: '- c.\n\n  <!--\n- d.\n',
			line: 2,
		},
	])('$label → an unclosed comment at line $line', ({ text, line }) => {
		expect(readMarkdownBlocks({ text }).unclosedComment).toBe(line)
	})

	it.each([
		{ label: '<!-->', text: '<!-->\nx\n' },
		{ label: '<!--->', text: '<!--->\nx\n' },
		{ label: 'a comment closed on its line', text: '<!-- x -->\nx\n' },
		{ label: 'a comment closed lines later', text: '<!--\nx\n-->\n' },
	])('$label → no unclosed comment', ({ text }) => {
		expect(readMarkdownBlocks({ text }).unclosedComment).toBeUndefined()
	})

	it.each([
		{ label: 'a backtick fence never closed', text: '```\nx\n', kind: 'fence' },
		{ label: 'a tilde fence never closed', text: '~~~\nx\n', kind: 'fence' },
		{
			label: 'a four-backtick fence a three-backtick line does not close',
			text: '````\n```\nx\n',
			kind: 'fence',
		},
		{ label: 'a pre block never closed', text: '<pre>\nx\n', kind: 'html' },
		{ label: 'a script block never closed', text: '<script>\nx\n', kind: 'html' },
		{ label: 'a processing instruction never closed', text: '<?php\nx\n', kind: 'html' },
		{ label: 'a declaration never closed', text: '<!DOCTYPE x\ny\n', kind: 'html' },
		{ label: 'a CDATA section never closed', text: '<![CDATA[ x\ny\n', kind: 'html' },
		{
			label: 'items nested deeper than the reader reads',
			text: Array.from({ length: 25 }, (_, depth) => `${'  '.repeat(depth)}- l${depth}`).join('\n'),
			kind: 'nesting',
		},
	])('$label → an unclosed $kind block', ({ text, kind }) => {
		expect(readMarkdownBlocks({ text }).unclosedBlock).toBe(kind)
	})

	it.each([
		{ label: 'a closed fence at the end', text: '```\nx\n```\n' },
		{ label: 'a closed fence with no final line break', text: '```\nx\n```' },
		{ label: 'a lone unclosed comment (its own problem)', text: '<!--\nx\n' },
		{ label: 'a fence left open inside an item (its item closes it)', text: '- a\n  ```\n  x\n' },
		{ label: 'indented code at the end', text: 'a\n\n    code\n' },
		{ label: 'a list item at the end', text: '- a' },
		{ label: 'a script tag inside a code span', text: '- a `<script>`\n- b\n' },
	])('$label → no unclosed block', ({ text }) => {
		expect(readMarkdownBlocks({ text }).unclosedBlock).toBeUndefined()
	})

	it.each([
		{
			label: 'a script opened in one item and closed in a later one',
			text: '### Changed\n\n- a <script>\n- **Breaking:** b\n- c </script>\n',
			piece: '<script>',
		},
		{
			label: 'a bold tag opened in one item and closed in a later one',
			text: '- a <b>\n- **Breaking:** b\n- c </b>\n',
			piece: '<b>',
		},
		{
			label: 'a paragraph opening a tag the next list closes',
			text: 'Para <b>\n\n- **Breaking:** b </b>\n',
			piece: '<b>',
		},
		{
			label: 'a heading opening a tag the next paragraph closes',
			text: '### Added <b>\n\nx </b>\n',
			piece: '<b>',
		},
		{
			label: 'a hidden div opened in a paragraph and closed in a later block',
			text: 'x <div hidden>\n\n- **Breaking:** b\n\n</div>\n',
			piece: '<div hidden>',
		},
		{
			label: 'an html block left inside an attribute value',
			text: '<div title="\n\n- **Breaking:** b\n',
			piece: '<div title="\n',
		},
		{
			label: 'a details wrapper spanning blocks',
			text: '<details>\n\n- a\n- **Breaking:** b\n\n</details>\n',
			piece: '<details>',
		},
		{
			label: 'a script element opened under an item',
			text: '- a\n\n  <script>\n- b\n',
			piece: '<script>',
		},
		{
			label: 'a script element closed under an item',
			text: '- a\n\n  <script>x</script>\n- b\n',
			piece: '<script>',
		},
		{
			label: 'an inline textarea never closed in a paragraph',
			text: 'Para <textarea>\n\n- b\n',
			piece: '<textarea>',
		},
		{ label: 'a div block with no final line break', text: '<div>\nx', piece: '<div>' },
		{
			label: 'a custom element whose name starts with script',
			text: '<script-x>\nx\n',
			piece: '<script-x>',
		},
	])('$label → open HTML naming $piece', ({ text, piece }) => {
		const blocks = readMarkdownBlocks({ text })

		expect({ kind: blocks.unclosedBlock, piece: blocks.openHtml }).toEqual({
			kind: 'open-html',
			piece,
		})
	})

	it.each([
		{ label: 'a bold tag closed in its own item', text: '- a <b>x</b>\n- **Breaking:** b\n' },
		{
			label: 'a bold tag opened and closed across two paragraphs of one item',
			text: '- a <b>\n\n  more </b>\n- **Breaking:** b\n',
		},
		{
			label: 'a script tag inside a comment block between items',
			text: '### Changed\n\n- a\n\n<!-- <script> -->\n- **Breaking:** b\n',
		},
		{
			label: 'a script tag inside an inline comment of an item',
			text: '### Changed\n\n- a <!-- <script> -->\n- **Breaking:** b\n',
		},
		{ label: 'a script tag inside a code span', text: '- a `<script>`\n- b\n' },
	])('$label → no open HTML', ({ text }) => {
		const blocks = readMarkdownBlocks({ text })

		expect({ kind: blocks.unclosedBlock, piece: blocks.openHtml }).toEqual({
			kind: undefined,
			piece: undefined,
		})
	})

	it('an unclosed comment beside an open bold tag → the comment problem, no open HTML', () => {
		const blocks = readMarkdownBlocks({ text: '- a <b>\n\n<!--\nx\n' })

		expect({ comment: blocks.unclosedComment, kind: blocks.unclosedBlock }).toEqual({
			comment: 2,
			kind: undefined,
		})
	})

	it('a text with lone carriage returns → its lines split as CommonMark splits them', () => {
		expect(readMarkdownBlocks({ text: 'a\rb\r\nc\n' }).lines).toEqual(['a', 'b', 'c', ''])
	})
})
