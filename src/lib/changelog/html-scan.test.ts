/** The raw HTML of a changelog block or item: only whole comments and balanced bare inert tags are read. */
import { refusedHtmlOf } from './html-scan.ts'

import { describe, expect, it } from 'vitest'

describe('refusedHtmlOf', () => {
	it.each([
		{ label: 'a bold pair', pieces: ['<b>', '</b>'] },
		{ label: 'tags in any ASCII case with a space before >', pieces: ['<KBD>', '</kbd >'] },
		{ label: 'a line break', pieces: ['<br>'] },
		{ label: 'a self-closed line break', pieces: ['<br/>'] },
		{ label: 'a self-closed line break with a space', pieces: ['<br />'] },
		{ label: 'a word break', pieces: ['<wbr>'] },
		{
			label: 'details holding a summary, in one html block',
			pieces: ['<details><summary>s</summary>x</details>\n'],
		},
		{ label: 'a whole comment', pieces: ['<!-- a note -->\n'] },
		{ label: 'an abrupt empty comment', pieces: ['<!-->'] },
		{ label: 'an abrupt empty comment with a dash', pieces: ['<!--->'] },
		{ label: 'a comment holding a script tag', pieces: ['<!-- <script> -->'] },
	])('$label → inert', ({ pieces }) => {
		expect(refusedHtmlOf({ pieces })).toBeUndefined()
	})

	it.each([
		{ label: 'a close of a void element', pieces: ['</br>'], piece: '</br>' },
		{ label: 'a name holding the Kelvin sign', pieces: ['<Kbd>'], piece: '<Kbd>' },
		{ label: 'a bold tag left open', pieces: ['<b>'], piece: '<b>' },
		{ label: 'a stray close', pieces: ['</b>'], piece: '</b>' },
		{ label: 'crossed closes', pieces: ['<b>', '<i>', '</b>', '</i>'], piece: '</b>' },
		{ label: 'an inner tag left open', pieces: ['<b>', '<i>', '</i>'], piece: '<b>' },
		{ label: 'the first problem met wins', pieces: ['<b>', '</i>'], piece: '</i>' },
		{ label: 'a self-closed non-void tag', pieces: ['<b/>'], piece: '<b/>' },
		{ label: 'an attribute', pieces: ['x <b class="x">y</b>\n'], piece: '<b class="x">' },
		{ label: 'a div', pieces: ['<div>\n'], piece: '<div>' },
		{ label: 'a script element', pieces: ['<script>', '</script>'], piece: '<script>' },
		{ label: 'a textarea', pieces: ['<textarea>'], piece: '<textarea>' },
		{ label: 'an xmp', pieces: ['<xmp>'], piece: '<xmp>' },
		{ label: 'a noscript', pieces: ['<noscript>'], piece: '<noscript>' },
		{ label: 'an svg', pieces: ['<svg>'], piece: '<svg>' },
		{ label: 'a math element', pieces: ['<math>'], piece: '<math>' },
		{ label: 'an image', pieces: ['<img src=x>'], piece: '<img src=x>' },
		{ label: 'a comment ended by --!>', pieces: ['<!-- a --!> b -->\n'], piece: '<!-- a --!>' },
		{ label: 'a comment opened as <!--!>', pieces: ['<!--!>\n'], piece: '<!--!>' },
		{ label: 'a CDATA section', pieces: ['<![CDATA[x]]>\n'], piece: '<![CDATA[x]]>' },
		{ label: 'a processing instruction', pieces: ['<?x?>\n'], piece: '<?x?>' },
		{ label: 'a declaration', pieces: ['<!DOCTYPE html>\n'], piece: '<!DOCTYPE html>' },
		{ label: 'a lone less-than sign in a block', pieces: ['<b>a < b</b>\n'], piece: '< b</b>' },
		{
			label: 'a piece left inside a tag, then an inline tag (each piece read alone)',
			pieces: ['<div title=x\n', '<i>'],
			piece: '<div title=x\n',
		},
	])('$label → refused, naming $piece', ({ pieces, piece }) => {
		expect(refusedHtmlOf({ pieces })).toBe(piece)
	})
})
