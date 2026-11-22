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
})
