/**
 * `escapeControlCharacters` (33S case 40, G15): what a text an agent wrote prints as. C0 controls (tab and line
 * breaks too), DEL, C1 controls and the bidi overrides and isolates become `\u{<hex>}`; everything else is kept.
 */
import { outcomeOf } from '../../../test/call-outcome.ts'
import { escapeControlCharacters } from './text-escape.ts'

import { describe, expect, it } from 'vitest'

type EscapeRow = { title: string; text: string; escaped: string }

const ESCAPED_ROWS: EscapeRow[] = [
	{ title: 'NUL', text: '\u0000', escaped: '\\u{0}' },
	{ title: 'a terminal escape sequence', text: '\u001b[31mred', escaped: '\\u{1b}[31mred' },
	{ title: 'a tab', text: 'a\tb', escaped: 'a\\u{9}b' },
	{ title: 'a line feed', text: 'a\nb', escaped: 'a\\u{a}b' },
	{ title: 'a carriage return', text: 'a\rb', escaped: 'a\\u{d}b' },
	{ title: 'the last C0 control', text: '\u001f', escaped: '\\u{1f}' },
	{ title: 'DEL', text: '\u007f', escaped: '\\u{7f}' },
	{ title: 'the first C1 control', text: '\u0080', escaped: '\\u{80}' },
	{ title: 'the C1 control sequence introducer', text: '\u009b', escaped: '\\u{9b}' },
	{ title: 'the last C1 control', text: '\u009f', escaped: '\\u{9f}' },
	{ title: 'the left-to-right embedding', text: '‪', escaped: '\\u{202a}' },
	{ title: 'the right-to-left override', text: '‮', escaped: '\\u{202e}' },
	{ title: 'the right-to-left embedding', text: '‫', escaped: '\\u{202b}' },
	{ title: 'the pop directional formatting', text: '‬', escaped: '\\u{202c}' },
	{ title: 'the left-to-right override', text: '‭', escaped: '\\u{202d}' },
	{ title: 'the left-to-right isolate', text: '⁦', escaped: '\\u{2066}' },
	{ title: 'the right-to-left isolate', text: '⁧', escaped: '\\u{2067}' },
	{ title: 'the first strong isolate', text: '⁨', escaped: '\\u{2068}' },
	{ title: 'the pop directional isolate', text: '⁩', escaped: '\\u{2069}' },
	{ title: 'the left-to-right mark', text: '‎', escaped: '\\u{200e}' },
	{ title: 'the right-to-left mark', text: '‏', escaped: '\\u{200f}' },
	{ title: 'the Arabic letter mark', text: '؜', escaped: '\\u{61c}' },
	{ title: 'the line separator', text: ' ', escaped: '\\u{2028}' },
	{ title: 'the paragraph separator', text: ' ', escaped: '\\u{2029}' },
	{
		title: 'controls inside a sentence',
		text: 'ok‮evil\u001b[2J',
		escaped: 'ok\\u{202e}evil\\u{1b}[2J',
	},
]

const KEPT_ROWS: { title: string; text: string }[] = [
	{ title: 'plain text', text: 'Keep the entry? (yes/no)' },
	{ title: 'the empty text', text: '' },
	{ title: 'accented letters', text: 'café déjà vu' },
	{ title: 'Cyrillic and Japanese', text: 'Привет 日本語' },
	{ title: 'an emoji', text: 'ship it 😀' },
	{ title: 'the space', text: 'a b' },
	{ title: 'the tilde, just below DEL', text: '~' },
	{ title: 'the no-break space, just above the C1 controls', text: ' ' },
	{ title: 'U+202F, just above the overrides', text: ' ' },
	{ title: 'U+2065, just below the isolates', text: '⁥' },
	{ title: 'U+206A, just above the isolates', text: '⁪' },
	{ title: 'a backslash and a literal \\u{1b}', text: 'a\\b \\u{1b}' },
]

describe('escapeControlCharacters', () => {
	for (const row of ESCAPED_ROWS)
		it(`${row.title} -> written as \\u{<hex>}`, () => {
			expect(outcomeOf(() => escapeControlCharacters({ text: row.text }))).toEqual({
				value: row.escaped,
			})
		})

	for (const row of KEPT_ROWS)
		it(`${row.title} -> kept as it is`, () => {
			expect(outcomeOf(() => escapeControlCharacters({ text: row.text }))).toEqual({
				value: row.text,
			})
		})
})
