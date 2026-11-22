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
			label: 'a script element opened under an item',
			text: '- a\n\n  <script>\n- b\n',
			kind: 'html',
		},
		{
			label: 'a style element opened under an item',
			text: '- a\n\n  <style>\n- b\n',
			kind: 'html',
		},
		{
			label: 'a textarea element opened under an item',
			text: '- a\n\n  <textarea>\n- b\n',
			kind: 'html',
		},
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
		{ label: 'a div block with no final line break', text: '<div>\nx' },
		{ label: 'a lone unclosed comment (its own problem)', text: '<!--\nx\n' },
		{ label: 'a fence left open inside an item (its item closes it)', text: '- a\n  ```\n  x\n' },
		{ label: 'indented code at the end', text: 'a\n\n    code\n' },
		{ label: 'a list item at the end', text: '- a' },
		{ label: 'a script element closed under an item', text: '- a\n\n  <script>x</script>\n- b\n' },
	])('$label → no unclosed block', ({ text }) => {
		expect(readMarkdownBlocks({ text }).unclosedBlock).toBeUndefined()
	})

	it('a text with lone carriage returns → its lines split as CommonMark splits them', () => {
		expect(readMarkdownBlocks({ text: 'a\rb\r\nc\n' }).lines).toEqual(['a', 'b', 'c', ''])
	})
})
