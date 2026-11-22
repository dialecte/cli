/** A changelog section cut into its top-level blocks: the bullet items a release moves, and every other block. */
import { sectionItemsOf } from './section-items.ts'

import { describe, expect, it } from 'vitest'

import type { SectionBlock } from './changelog.types.ts'

/** A bullet item block. */
function item(params: { text: string; breaking?: boolean; multiBlock?: boolean }): SectionBlock {
	return {
		kind: 'item',
		text: params.text,
		breaking: params.breaking ?? false,
		multiBlock: params.multiBlock ?? false,
	}
}

/** A block that is no bullet item. */
function text(params: { text: string; multiBlock?: boolean }): SectionBlock {
	return {
		kind: 'text',
		text: params.text,
		breaking: false,
		multiBlock: params.multiBlock ?? false,
	}
}

describe('sectionItemsOf', () => {
	it.each([
		{
			label: 'one-line bullets → one item each',
			text: '- one.\n- two.',
			blocks: [item({ text: '- one.' }), item({ text: '- two.' })],
		},
		{
			label: 'an item with an indented second paragraph → one multi-block item',
			text: '- one.\n\n  more of one.\n- two.',
			blocks: [
				item({ text: '- one.\n\n  more of one.', multiBlock: true }),
				item({ text: '- two.' }),
			],
		},
		{
			label: 'an item whose indented fence holds a blank line → one item, not multi-block',
			text: '- one:\n  ```ts\n  const a = 1\n\n  const b = 2\n  ```\n- two.',
			blocks: [
				item({ text: '- one:\n  ```ts\n  const a = 1\n\n  const b = 2\n  ```' }),
				item({ text: '- two.' }),
			],
		},
		{
			label: 'nested bullets → continuation of their item',
			text: '- one:\n  - nested a.\n  - nested b.\n- two.',
			blocks: [item({ text: '- one:\n  - nested a.\n  - nested b.' }), item({ text: '- two.' })],
		},
		{
			label: 'a column-0 line right after an item line (lazy continuation) → kept in the item',
			text: '- one\n  carried on\nlazily.\n- two.',
			blocks: [item({ text: '- one\n  carried on\nlazily.' }), item({ text: '- two.' })],
		},
		{
			label: 'a column-0 fence right after an item line → a text block',
			text: '- one:\n```md\n- not an item\n```',
			blocks: [item({ text: '- one:' }), text({ text: '```md\n- not an item\n```' })],
		},
		{
			label: 'an ATX heading right after an item line → a text block',
			text: '- one.\n#### Note',
			blocks: [item({ text: '- one.' }), text({ text: '#### Note' })],
		},
		{
			label: 'a block quote right after an item line → a text block',
			text: '- one.\n> quoted.',
			blocks: [item({ text: '- one.' }), text({ text: '> quoted.' })],
		},
		{
			label: 'a thematic break right after an item line → a text block',
			text: '- one.\n---',
			blocks: [item({ text: '- one.' }), text({ text: '---' })],
		},
		{
			label:
				'an item, a blank line, then a column-0 paragraph → the paragraph is a text block of its own',
			text: '- one.\n\nA paragraph.\n- two.',
			blocks: [item({ text: '- one.' }), text({ text: 'A paragraph.' }), item({ text: '- two.' })],
		},
		{
			label: 'an item whose code example stands between blank lines → one multi-block item',
			text: '- one:\n\n  ```ts\n  const a = 1\n  ```\n\n- two.',
			blocks: [
				item({ text: '- one:\n\n  ```ts\n  const a = 1\n  ```', multiBlock: true }),
				item({ text: '- two.' }),
			],
		},
		{
			label: 'a `- ` line inside a column-0 fence → no block of its own',
			text: '- one:\n\n```md\n- inside\n\n- still inside\n```\n\n- two.',
			blocks: [
				item({ text: '- one:' }),
				text({ text: '```md\n- inside\n\n- still inside\n```' }),
				item({ text: '- two.' }),
			],
		},
		{
			label:
				'a multi-line HTML comment holding a bullet → one text block, nothing lifted out of it',
			text: '- one.\n<!--\n- **Breaking:** hidden.\n-->\n- two.',
			blocks: [
				item({ text: '- one.' }),
				text({ text: '<!--\n- **Breaking:** hidden.\n-->' }),
				item({ text: '- two.' }),
			],
		},
		{
			label:
				'an HTML comment holding a blank line → one text block, its blank line inside the comment, not a second block',
			text: '- one.\n\n<!-- a note\n\n- **Breaking:** hidden. -->\n\n- two.',
			blocks: [
				item({ text: '- one.' }),
				text({ text: '<!-- a note\n\n- **Breaking:** hidden. -->' }),
				item({ text: '- two.' }),
			],
		},
		{
			label: 'a comment opened and closed as <!--> → one text block, the next bullet an item',
			text: '- one.\n<!-->\n- **Breaking:** two.',
			blocks: [
				item({ text: '- one.' }),
				text({ text: '<!-->' }),
				item({ text: '- **Breaking:** two.', breaking: true }),
			],
		},
		{
			label:
				'an HTML comment indented by up to three spaces → one text block, nothing lifted out of it',
			text: '- a.\n\n <!--\n- **Breaking:** hidden.\n -->',
			blocks: [item({ text: '- a.' }), text({ text: ' <!--\n- **Breaking:** hidden.\n -->' })],
		},
		{
			label: "a comment opener indented by four spaces → an item's continuation, no comment",
			text: '- a.\n\n    <!--\n- b.',
			blocks: [item({ text: '- a.\n\n    <!--', multiBlock: true }), item({ text: '- b.' })],
		},
		{
			label:
				'a comment indented under a breaking item, then its note → both stay in that item, nothing left behind',
			text: '- c.\n- **Breaking:** a.\n\n  <!-- x -->\n  Migrate with `foo --bar`.\n- d.',
			blocks: [
				item({ text: '- c.' }),
				item({
					text: '- **Breaking:** a.\n\n  <!-- x -->\n  Migrate with `foo --bar`.',
					breaking: true,
					multiBlock: true,
				}),
				item({ text: '- d.' }),
			],
		},
		{
			label:
				'a comment opened under an item, then a column-0 bullet → the comment ends with its item, the bullet a visible item',
			text: '- c.\n\n  <!--\n- **Breaking:** visible\n  -->',
			blocks: [
				item({ text: '- c.\n\n  <!--', multiBlock: true }),
				item({ text: '- **Breaking:** visible\n  -->', breaking: true }),
			],
		},
		{
			label: 'a four-backtick fence holding a three-backtick fence and a bullet → one text block',
			text: '- one:\n\n````md\n```\n- **Breaking:** inside.\n```\n````\n\n- two.',
			blocks: [
				item({ text: '- one:' }),
				text({ text: '````md\n```\n- **Breaking:** inside.\n```\n````' }),
				item({ text: '- two.' }),
			],
		},
		{
			label: 'an ordered list → one text block, never cut into items',
			text: '1. first.\n2. **Breaking:** second.\n3. third.',
			blocks: [text({ text: '1. first.\n2. **Breaking:** second.\n3. third.' })],
		},
		{
			label: 'a `*` list → one text block',
			text: '* first.\n* second.',
			blocks: [text({ text: '* first.\n* second.' })],
		},
		{
			label: 'text before the first item → a text block, then the items',
			text: 'Intro:\n\n- one.\n- two.',
			blocks: [text({ text: 'Intro:' }), item({ text: '- one.' }), item({ text: '- two.' })],
		},
		{
			label: 'two paragraphs → two text blocks',
			text: 'First paragraph.\n\nSecond paragraph.',
			blocks: [text({ text: 'First paragraph.' }), text({ text: 'Second paragraph.' })],
		},
		{
			label: 'a bullet right after a paragraph line → the bullet opens an item',
			text: 'Intro:\n- one.',
			blocks: [text({ text: 'Intro:' }), item({ text: '- one.' })],
		},
		{
			label: 'blank lines between one-line items → each item without its trailing blank line',
			text: '- one.\n\n- two.',
			blocks: [item({ text: '- one.' }), item({ text: '- two.' })],
		},
	])('$label', ({ text: section, blocks }) => {
		expect(sectionItemsOf({ text: section })).toEqual(blocks)
	})

	it.each([
		{ label: '`**Breaking:**`', line: '- **Breaking:** x.', breaking: true },
		{ label: '`**Breaking**:`', line: '- **Breaking**: x.', breaking: true },
		{ label: '`**Breaking (types):**`', line: '- **Breaking (types):** x.', breaking: true },
		{ label: '`**Breaking (tests): ...**`', line: '- **Breaking (tests): x.**', breaking: true },
		{ label: 'a bold whole sentence', line: '- **Breaking: x waits.**', breaking: true },
		{ label: '`**Breaking** - ...`', line: '- **Breaking** - x.', breaking: true },
		{
			label: '`**Breaking** for ...`',
			line: '- **Breaking** for library copies: x.',
			breaking: true,
		},
		{
			label: '`**Breaking, ...**`',
			line: '- **Breaking, for the opt-in surface only.** x.',
			breaking: true,
		},
		{ label: '`**Breaking - ...**`', line: '- **Breaking - one stored form.** x.', breaking: true },
		{ label: '`**BREAKING**:`', line: '- **BREAKING**: x.', breaking: true },
		{ label: 'plain `Breaking:`', line: '- Breaking: x.', breaking: true },
		{ label: 'plain `Breaking (types):`', line: '- Breaking (types): x.', breaking: true },
		{
			label: 'the word with no colon',
			line: '- Breaking a long line no longer wraps.',
			breaking: false,
		},
		{ label: 'a longer bold word', line: '- **Breakingly** fast.', breaking: false },
		{ label: 'another opening word', line: '- Not breaking: x.', breaking: false },
		{ label: 'the marker later in the line', line: '- x. **Breaking:** y.', breaking: false },
	])('an item opening with $label → breaking $breaking', ({ line, breaking }) => {
		expect(sectionItemsOf({ text: line })).toEqual([item({ text: line, breaking })])
	})

	it.each([
		{
			label: 'a fence ends the list, then an indented comment hiding a bullet → CommonMark blocks',
			text: '- a.\n```\nf\n```\n  <!--\n- **Breaking:** cm-hidden\n  -->',
			blocks: [
				item({ text: '- a.' }),
				text({ text: '```\nf\n```' }),
				text({ text: '  <!--\n- **Breaking:** cm-hidden\n  -->' }),
			],
		},
		{
			label: 'a quote ends the list, then an indented comment hiding a bullet → CommonMark blocks',
			text: '- a.\n> q\n  <!--\n- **Breaking:** cm-hidden\n  -->',
			blocks: [
				item({ text: '- a.' }),
				text({ text: '> q' }),
				text({ text: '  <!--\n- **Breaking:** cm-hidden\n  -->' }),
			],
		},
		{
			label: 'a rule ends the list, then an indented comment hiding a bullet → CommonMark blocks',
			text: '- a.\n***\n  <!--\n- **Breaking:** cm-hidden\n  -->',
			blocks: [
				item({ text: '- a.' }),
				text({ text: '***' }),
				text({ text: '  <!--\n- **Breaking:** cm-hidden\n  -->' }),
			],
		},
		{
			label:
				'a heading ends the list, then an indented comment hiding a bullet → CommonMark blocks',
			text: '- a\n# H\n  <!--\n- **Breaking:** cm-hidden\n  -->',
			blocks: [
				item({ text: '- a' }),
				text({ text: '# H' }),
				text({ text: '  <!--\n- **Breaking:** cm-hidden\n  -->' }),
			],
		},
		{
			label: 'a 1. list ends the bullets, then a comment indented short of it → CommonMark blocks',
			text: '- a\n1. x\n  <!--\n- **Breaking:** cm-hidden\n  -->',
			blocks: [
				item({ text: '- a' }),
				text({ text: '1. x' }),
				text({ text: '  <!--\n- **Breaking:** cm-hidden\n  -->' }),
			],
		},
		{
			label: 'a 10. list ends the bullets, then a comment indented short of it → CommonMark blocks',
			text: '- a\n10. x\n   <!--\n- **Breaking:** cm-hidden\n   -->',
			blocks: [
				item({ text: '- a' }),
				text({ text: '10. x' }),
				text({ text: '   <!--\n- **Breaking:** cm-hidden\n   -->' }),
			],
		},
		{
			label: 'a comment under a breaking item, then its note → CommonMark blocks',
			text: '- c.\n- **Breaking:** a.\n\n  <!-- x -->\n  Migrate with foo.\n- d.',
			blocks: [
				item({ text: '- c.' }),
				item({
					text: '- **Breaking:** a.\n\n  <!-- x -->\n  Migrate with foo.',
					breaking: true,
					multiBlock: true,
				}),
				item({ text: '- d.' }),
			],
		},
		{
			label:
				'a comment indented by one space after an item → a block of its own → CommonMark blocks',
			text: '- a\n\n <!--\n- **Breaking:** hidden\n -->',
			blocks: [item({ text: '- a' }), text({ text: ' <!--\n- **Breaking:** hidden\n -->' })],
		},
		{
			label: '<!--> indented by one space → closed on its line → CommonMark blocks',
			text: '- a\n\n <!-->\n- **Breaking:** v',
			blocks: [
				item({ text: '- a' }),
				text({ text: ' <!-->' }),
				item({ text: '- **Breaking:** v', breaking: true }),
			],
		},
		{
			label: "<!----> under an item → the item's own, closed → CommonMark blocks",
			text: '- a\n\n  <!---->\n- **Breaking:** v',
			blocks: [
				item({ text: '- a\n\n  <!---->', multiBlock: true }),
				item({ text: '- **Breaking:** v', breaking: true }),
			],
		},
		{
			label: "a comment closed on the line after an item line → the item's own → CommonMark blocks",
			text: '- a\n  <!-- x -->\n- **Breaking:** v',
			blocks: [
				item({ text: '- a\n  <!-- x -->' }),
				item({ text: '- **Breaking:** v', breaking: true }),
			],
		},
		{
			label: "a comment in a nested item → the outer item's text → CommonMark blocks",
			text: '- **Breaking:** a.\n  - sub\n\n    <!-- sub note -->\n    sub text\n- c.',
			blocks: [
				item({
					text: '- **Breaking:** a.\n  - sub\n\n    <!-- sub note -->\n    sub text',
					breaking: true,
				}),
				item({ text: '- c.' }),
			],
		},
		{
			label: 'a comment and a note under a plain item, a breaking item after → CommonMark blocks',
			text: '- c.\n\n  <!-- note -->\n  More c.\n- **Breaking:** b.',
			blocks: [
				item({ text: '- c.\n\n  <!-- note -->\n  More c.', multiBlock: true }),
				item({ text: '- **Breaking:** b.', breaking: true }),
			],
		},
		{
			label:
				'a comment indented by one space, then a paragraph → two blocks of their own → CommonMark blocks',
			text: '- a.\n\n <!-- x -->\n More.\n- **Breaking:** b.',
			blocks: [
				item({ text: '- a.' }),
				text({ text: ' <!-- x -->' }),
				text({ text: ' More.' }),
				item({ text: '- **Breaking:** b.', breaking: true }),
			],
		},
		{
			label: "an item's comment holding a blank line → the item's own → CommonMark blocks",
			text: '- a.\n\n  <!--\n\n  still hidden\n  -->\n- **Breaking:** b.',
			blocks: [
				item({ text: '- a.\n\n  <!--\n\n  still hidden\n  -->', multiBlock: true }),
				item({ text: '- **Breaking:** b.', breaking: true }),
			],
		},
		{
			label: 'a * list holding a closed comment → one text block → CommonMark blocks',
			text: '* a\n\n  <!-- x -->\n- **Breaking:** b.',
			blocks: [
				text({ text: '* a\n\n  <!-- x -->' }),
				item({ text: '- **Breaking:** b.', breaking: true }),
			],
		},
		{
			label: 'a 1. list holding a closed comment → one text block → CommonMark blocks',
			text: '1. a\n\n   <!-- x -->\n- **Breaking:** b.',
			blocks: [
				text({ text: '1. a\n\n   <!-- x -->' }),
				item({ text: '- **Breaking:** b.', breaking: true }),
			],
		},
		{
			label:
				"a nested list with a blank line before the item's second child → multi-block → CommonMark blocks",
			text: '- a\n  - s\n\n  more\n- b',
			blocks: [item({ text: '- a\n  - s\n\n  more', multiBlock: true }), item({ text: '- b' })],
		},
		{
			label:
				'a link reference definition with its title on the next line → one text block, kept → CommonMark blocks',
			text: 'Text.\n\n[foo]: https://x.test\n  "Title"\n\n- a.',
			blocks: [
				text({ text: 'Text.' }),
				text({ text: '[foo]: https://x.test\n  "Title"' }),
				item({ text: '- a.' }),
			],
		},
		{
			label: 'lone carriage returns → lines split as CommonMark splits them → CommonMark blocks',
			text: '- a.\r- b.',
			blocks: [item({ text: '- a.' }), item({ text: '- b.' })],
		},
	])('$label', ({ text: section, blocks }) => {
		expect(sectionItemsOf({ text: section })).toEqual(blocks)
	})
})
