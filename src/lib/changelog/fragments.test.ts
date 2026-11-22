/** Changelog fragments: one `changes/<name>.md` per lot, its entries under the changelog's own section headings. */
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import { createScratchRepository } from '../../../test/scratch-repository.ts'
import { readFragments } from './fragments.ts'

import { describe, expect, it } from 'vitest'

/** The inert tags the open-HTML problem names, in its order. */
const INERT_TAGS =
	'<b>, <i>, <u>, <s>, <em>, <strong>, <small>, <mark>, <del>, <ins>, <sub>, <sup>, <code>, <kbd>, <samp>, <var>, <details>, <summary>, <br>, <wbr>'

describe('readFragments', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('two fragments → their sections, each entry text as written, the fragments in file name order', () => {
		const root = createScratchRepository({
			'changes/b-lot.md': '### Fixed\n\n- the gate reads the tree.\n',
			'changes/a-lot.md': '### Added\n\n- `changelog release`.\n\n### Fixed\n\n- a typo.\n',
		})

		expect(readFragments({ root })).toEqual({
			fragments: [
				{
					file: 'changes/a-lot.md',
					sections: [
						{ section: 'Added', text: '- `changelog release`.' },
						{ section: 'Fixed', text: '- a typo.' },
					],
				},
				{
					file: 'changes/b-lot.md',
					sections: [{ section: 'Fixed', text: '- the gate reads the tree.' }],
				},
			],
			notes: [],
			problems: [],
		})
	})

	it.each([
		{
			label: 'a heading that is no changelog section',
			text: '### Improved\n\n- faster.\n',
			problem:
				'heading "### Improved" is no section: Added, Changed, Deprecated, Removed, Fixed, Security',
		},
		{
			label: 'text before the first heading',
			text: 'a note\n\n### Added\n\n- x.\n',
			problem: 'text before the first section heading',
		},
		{
			label: 'a section with no text',
			text: '### Added\n\n### Fixed\n\n- x.\n',
			problem: 'section Added holds no text',
		},
		{ label: 'no section at all', text: '\n', problem: 'holds no section' },
		{
			label: 'an HTML comment that never closes',
			text: '### Changed\n\n- a.\n\n<!-- todo\n\n- **Breaking:** hidden?\n',
			problem: 'an HTML comment opens and never closes',
		},
		{
			label: 'a comment opened under an item, ended by the next item',
			text: '### Changed\n\n- c.\n\n  <!--\n- **Breaking:** visible\n  -->\n',
			problem: 'an HTML comment opens and never closes',
		},
		{
			label: 'a tab-indented comment under an item',
			text: '### Changed\n\n- a\n\n\t<!--\n- **Breaking:** t\n\t-->\n',
			problem: 'an HTML comment opens and never closes',
		},
		{
			label: "an item's comment that its item's end cuts short",
			text: '### Changed\n\n- a.\n\n  <!--\n- **Breaking:** b.\n  -->\n- c.\n',
			problem: 'an HTML comment opens and never closes',
		},
		{
			label: 'a comment under a * item ended by a - item',
			text: '### Changed\n\n* a\n\n  <!--\n- **Breaking:** cm-visible\n  -->\n',
			problem: 'an HTML comment opens and never closes',
		},
		{
			label: 'a comment under a 1. item ended by a - item',
			text: '### Changed\n\n1. a\n\n   <!--\n- **Breaking:** cm-visible\n   -->\n',
			problem: 'an HTML comment opens and never closes',
		},
		{
			label: 'a comment opener inside a div block',
			text: '### Changed\n\n- a.\n\n<div>\n<!--\n</div>\n',
			problem: 'an HTML comment opens and never closes',
		},
		{
			label: 'a closed comment then an open one on its line',
			text: '### Changed\n\n- a.\n\n<!-- a --> <!-- b\n',
			problem: 'an HTML comment opens and never closes',
		},
		{
			label: 'a code fence that never closes',
			text: '### Changed\n\n- a.\n\n```\nx\n',
			problem: 'a code fence opens and never closes',
		},
		{
			label: 'a pre block that never closes',
			text: '### Changed\n\n- a.\n\n<pre>\nx\n',
			problem: 'an HTML block opens and never closes',
		},
		{
			label: 'a script block that never closes',
			text: '### Changed\n\n- a.\n\n<script>\nx\n',
			problem: 'an HTML block opens and never closes',
		},
		{
			label: 'a script element opened under an item',
			text: '### Changed\n\n- a\n\n  <script>\n- **Breaking:** b\n',
			problem: `HTML \`<script>\` is not a whole comment or a balanced bare tag of its block or item (${INERT_TAGS}); put code in backticks`,
		},
		{
			label: 'a script opened in one item and closed in a later one',
			text: '### Changed\n\n- a <script>\n- **Breaking:** b\n- c </script>\n',
			problem: `HTML \`<script>\` is not a whole comment or a balanced bare tag of its block or item (${INERT_TAGS}); put code in backticks`,
		},
		{
			label: 'an image with a source',
			text: '### Changed\n\n- a <img src="x.png"> shot\n',
			problem: `HTML \`<img src="x.png">\` is not a whole comment or a balanced bare tag of its block or item (${INERT_TAGS}); put code in backticks`,
		},
		{
			label: 'a link element of raw HTML',
			text: '### Changed\n\n- see <a href="https://e">this</a>\n',
			problem: `HTML \`<a href="https://e">\` is not a whole comment or a balanced bare tag of its block or item (${INERT_TAGS}); put code in backticks`,
		},
		{
			label: 'a placeholder written in prose',
			text: '### Changed\n\n- run release <version> now\n',
			problem: `HTML \`<version>\` is not a whole comment or a balanced bare tag of its block or item (${INERT_TAGS}); put code in backticks`,
		},
		{
			label: 'a refused tag over 60 characters across a line break',
			text: '### Changed\n\n<div class="a-very-long-class-name another-long-class-name\n  third-class">\n',
			problem: `HTML \`<div class="a-very-long-class-name another-long-class-name …\` is not a whole comment or a balanced bare tag of its block or item (${INERT_TAGS}); put code in backticks`,
		},
		{
			label: 'a refused piece holding a replacement pattern',
			text: "### Changed\n\n- a <i title='$&'>x</i>\n",
			problem: `HTML \`<i title='$&'>\` is not a whole comment or a balanced bare tag of its block or item (${INERT_TAGS}); put code in backticks`,
		},
		{
			label: 'items nested deeper than the markdown reader reads',
			text: `### Changed\n\n${Array.from({ length: 25 }, (_, depth) => `${'  '.repeat(depth)}- l${depth}`).join('\n')}\n`,
			problem: 'it nests deeper than the 20 levels the markdown reader reads',
		},
		{
			label: 'a heading of only ###',
			text: '###\n\n- x.\n',
			problem: 'heading "### " is no section: Added, Changed, Deprecated, Removed, Fixed, Security',
		},
		{
			label: 'the same section twice',
			text: '### Added\n\n- a.\n\n### Added\n\n- b.\n',
			problem: 'section Added appears twice',
		},
	])('$label → a problem naming the fragment', ({ text, problem }) => {
		const root = createScratchRepository({ 'changes/lot.md': text })

		expect(readFragments({ root }).problems).toEqual([{ file: 'changes/lot.md', problem }])
	})

	it.each([
		{ label: 'indented by one space', text: ' ### Added\n\n- x.\n' },
		{ label: 'a tab after the hashes', text: '###\tAdded\n\n- x.\n' },
		{ label: 'a closing hash sequence', text: '### Added ###\n\n- x.\n' },
	])('a section heading $label → the Added section', ({ text }) => {
		const root = createScratchRepository({ 'changes/lot.md': text })

		expect(readFragments({ root }).fragments).toEqual([
			{ file: 'changes/lot.md', sections: [{ section: 'Added', text: '- x.' }] },
		])
	})

	it('a CRLF fragment → read as LF, no carriage return in its text', () => {
		const root = createScratchRepository({ 'changes/lot.md': '### Added\r\n\r\n- x.\r\n- y.\r\n' })

		expect(readFragments({ root }).fragments).toEqual([
			{ file: 'changes/lot.md', sections: [{ section: 'Added', text: '- x.\n- y.' }] },
		])
	})

	it('no changes folder → no fragment, no problem', () => {
		expect(readFragments({ root: createScratchRepository() })).toEqual({
			fragments: [],
			notes: [],
			problems: [],
		})
	})

	it('a file of the folder that is no .md (a .gitkeep) → ignored', () => {
		const root = createScratchRepository({ 'changes/.gitkeep': '' })

		expect(readFragments({ root })).toEqual({ fragments: [], notes: [], problems: [] })
	})
})

describe('readFragments: a no-entry note', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('changes/<name>.none.md holding a reason → a note, no fragment, no problem', () => {
		const root = createScratchRepository({
			'changes/typo.none.md': 'a wording fix in the README\n',
		})

		expect(readFragments({ root })).toEqual({
			fragments: [],
			notes: [{ file: 'changes/typo.none.md', reason: 'a wording fix in the README' }],
			problems: [],
		})
	})

	it('changes/<name>.none.md with no text → a problem: it must say why no entry', () => {
		const root = createScratchRepository({ 'changes/typo.none.md': '\n' })

		expect(readFragments({ root }).problems).toEqual([
			{ file: 'changes/typo.none.md', problem: 'a no-entry note holds no reason' },
		])
	})

	it('a script tag inside a comment block between items → read, the comment kept as written', () => {
		const root = createScratchRepository({
			'changes/lot.md': '### Changed\n\n- a\n\n<!-- <script> -->\n- **Breaking:** b\n',
		})

		expect(readFragments({ root })).toEqual({
			fragments: [
				{
					file: 'changes/lot.md',
					sections: [{ section: 'Changed', text: '- a\n\n<!-- <script> -->\n- **Breaking:** b' }],
				},
			],
			notes: [],
			problems: [],
		})
	})

	it('a section opening with indented code → its indentation kept', () => {
		const root = createScratchRepository({
			'changes/lot.md': '### Added\n\n    code line\n\n- a.\n',
		})

		expect(readFragments({ root }).fragments).toEqual([
			{ file: 'changes/lot.md', sections: [{ section: 'Added', text: '    code line\n\n- a.' }] },
		])
	})

	it.each([
		{ label: 'an indented comment opener', block: '    <!--' },
		{ label: 'an indented script tag', block: '    <script>' },
		{ label: 'an indented title tag', block: '    <title>' },
	])(
		'$label before a breaking item → a problem: moving the item first would change how it reads',
		({ block }) => {
			const root = createScratchRepository({
				'changes/lot.md': `### Added\n\n${block}\n\n- **Breaking:** z\n`,
			})

			expect(readFragments({ root }).problems).toEqual([
				{
					file: 'changes/lot.md',
					problem: `section Added: putting its breaking items first changes how \`${block.trim()}\` reads; fence that block or indent it less`,
				},
			])
		},
	)
})
