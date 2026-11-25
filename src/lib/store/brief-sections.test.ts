/**
 * A brief's reviewer sections (`sections`): a list of `{ heading, text }` a change request shows verbatim, read by one
 * shape reader the start, `lot brief` and every render share.
 */
import { sectionsOf } from './brief-sections.ts'

import { describe, expect, it } from 'vitest'

type SectionRow = {
	name: string
	value: unknown
	/** `<rule>:<field>` of every refusal, in order. */
	refused: string[]
}

const GOOD = {
	heading: 'Deviations from the design',
	text: 'The reader keeps one pass.\n\n- a list item',
}

/** One section with `changes` over the good one. */
function oneWith(changes: Record<string, unknown>): unknown {
	return [{ ...GOOD, ...changes }]
}

const SECTION_ROWS: SectionRow[] = [
	{ name: 'no sections', value: undefined, refused: [] },
	{ name: 'an empty list', value: [], refused: [] },
	{ name: 'one good section', value: [GOOD], refused: [] },
	{
		name: 'a balanced details block and prose with angle brackets',
		value: oneWith({
			text: '<details>\n<summary>Why</summary>\n\nThe Array<T> reader stays.\n\n</details>',
		}),
		refused: [],
	},
	{ name: 'not a list', value: 'Deviations', refused: ['shape:sections'] },
	{ name: 'an item that is no object', value: ['Deviations'], refused: ['shape:sections[0]'] },
	{
		name: 'an item with another key',
		value: oneWith({ title: 'x' }),
		refused: ['shape:sections[0]'],
	},
	{ name: 'a text that is no string', value: oneWith({ text: 3 }), refused: ['shape:sections[0]'] },
	{
		name: 'an empty heading',
		value: oneWith({ heading: '  ' }),
		refused: ['shape:sections[0].heading'],
	},
	{
		name: 'a heading on two lines',
		value: oneWith({ heading: 'Deviations\nfrom the design' }),
		refused: ['shape:sections[0].heading'],
	},
	{
		name: 'a heading led by #',
		value: oneWith({ heading: '### Deviations' }),
		refused: ['shape:sections[0].heading'],
	},
	{
		name: 'a heading longer than 120 characters',
		value: oneWith({ heading: 'h'.repeat(121) }),
		refused: ['shape:sections[0].heading'],
	},
	{
		name: 'two headings equal but for case and spaces',
		value: [GOOD, { heading: ' deviations FROM the design ', text: 'more' }],
		refused: ['shape:sections[1].heading'],
	},
	{ name: 'an empty text', value: oneWith({ text: '\n \n' }), refused: ['shape:sections[0].text'] },
	{
		name: 'a text holding a renderer comment line',
		value: oneWith({ text: 'one\n<!-- dialecte:kept -->\ntwo' }),
		refused: ['shape:sections[0].text'],
	},
	{
		name: 'a text opening a fence it never closes',
		value: oneWith({ text: 'one\n\n```ts\nconst a = 1' }),
		refused: ['shape:sections[0].text'],
	},
	{
		name: 'a text opening a comment it never closes',
		value: oneWith({ text: 'one\n\n<!-- a note' }),
		refused: ['shape:sections[0].text'],
	},
	{
		name: 'a text opening a details block it never closes',
		value: oneWith({ text: '<details>\n<summary>Why</summary>\n\nThe reader stays.' }),
		refused: ['shape:sections[0].text'],
	},
	{
		name: 'a text holding a bullet task box',
		value: oneWith({ text: 'Check:\n\n- [ ] the reader' }),
		refused: ['shape:sections[0].text'],
	},
	{
		name: 'a text holding an ordered task box with extra spaces',
		value: oneWith({ text: 'Check:\n\n  1.   [x] the reader' }),
		refused: ['shape:sections[0].text'],
	},
	{
		name: 'a text holding a task box in a blockquote',
		value: oneWith({ text: 'Check:\n\n> - [ ] the reader\n>> 1. [x] nested' }),
		refused: ['shape:sections[0].text'],
	},
	{
		name: 'more than 20 sections',
		value: Array.from({ length: 21 }, (_, index) => ({ heading: `Part ${index}`, text: 'x' })),
		refused: ['shape:sections'],
	},
	{
		name: 'headings and texts longer than 20 000 characters together',
		value: [
			{ heading: 'One', text: 'a'.repeat(10_000) },
			{ heading: 'Two', text: 'b'.repeat(9_998) },
		],
		refused: ['shape:sections'],
	},
]

describe('brief sections - the shape reader', () => {
	it.each(SECTION_ROWS)('$name', (row) => {
		expect(
			sectionsOf({ value: row.value }).refused.map((refusal) => `${refusal.rule}:${refusal.field}`),
		).toEqual(row.refused)
	})

	it('a good list -> its sections as given, none refused', () => {
		expect(sectionsOf({ value: [GOOD] })).toEqual({ sections: [GOOD], refused: [] })
	})
})
