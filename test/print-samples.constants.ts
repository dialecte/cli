import type { EscapedSample } from './print-samples.types.ts'

/**
 * The characters a terminal acts on or that reorder text: each prints as `\u{<hex>}`, lowercase, no padding. Every
 * character is written as an escape.
 */
export const ESCAPED_SAMPLES: readonly EscapedSample[] = [
	{ title: 'the first C0 control', character: '\u{0}', escaped: '\\u{0}' },
	{ title: 'a tab', character: '\t', escaped: '\\u{9}' },
	{ title: 'a line feed', character: '\n', escaped: '\\u{a}' },
	{ title: 'a carriage return', character: '\r', escaped: '\\u{d}' },
	{ title: 'the escape character', character: '\u{1b}', escaped: '\\u{1b}' },
	{ title: 'the last C0 control', character: '\u{1f}', escaped: '\\u{1f}' },
	{ title: 'DEL', character: '\u{7f}', escaped: '\\u{7f}' },
	{ title: 'the first C1 control', character: '\u{80}', escaped: '\\u{80}' },
	{ title: 'the next line control', character: '\u{85}', escaped: '\\u{85}' },
	{ title: 'the last C1 control', character: '\u{9f}', escaped: '\\u{9f}' },
	{ title: 'the Arabic letter mark', character: '\u{61c}', escaped: '\\u{61c}' },
	{ title: 'the left-to-right mark', character: '\u{200e}', escaped: '\\u{200e}' },
	{ title: 'the right-to-left mark', character: '\u{200f}', escaped: '\\u{200f}' },
	{ title: 'the line separator', character: '\u{2028}', escaped: '\\u{2028}' },
	{ title: 'the paragraph separator', character: '\u{2029}', escaped: '\\u{2029}' },
	{ title: 'the first bidi embedding', character: '\u{202a}', escaped: '\\u{202a}' },
	{ title: 'the right-to-left override', character: '\u{202e}', escaped: '\\u{202e}' },
	{ title: 'the first bidi isolate', character: '\u{2066}', escaped: '\\u{2066}' },
	{ title: 'the last bidi isolate', character: '\u{2069}', escaped: '\\u{2069}' },
	{ title: 'the C1 control sequence introducer', character: '\u{9b}', escaped: '\\u{9b}' },
	{ title: 'the right-to-left embedding', character: '\u{202b}', escaped: '\\u{202b}' },
	{ title: 'the pop directional formatting', character: '\u{202c}', escaped: '\\u{202c}' },
	{ title: 'the left-to-right override', character: '\u{202d}', escaped: '\\u{202d}' },
	{ title: 'the right-to-left isolate', character: '\u{2067}', escaped: '\\u{2067}' },
	{ title: 'the first strong isolate', character: '\u{2068}', escaped: '\\u{2068}' },
]

/** Lines that print exactly as written, each with its title: text a person writes in any script, and a literal escape. */
export const KEPT_LINES: readonly { title: string; line: string }[] = [
	{ title: 'plain text', line: 'Keep the entry? (yes/no)' },
	{ title: 'the empty line', line: '' },
	{ title: 'accented letters', line: 'caf\u{e9} d\u{e9}j\u{e0} vu' },
	{
		title: 'Cyrillic and Japanese',
		line: '\u{41f}\u{440}\u{438}\u{432}\u{435}\u{442} \u{65e5}\u{672c}\u{8a9e}',
	},
	{ title: 'an emoji', line: 'ship it \u{1f600}' },
	{ title: 'a backslash and a literal \\u{1b}', line: 'a\\b \\u{1b}' },
]

/** Characters that print as they are: the neighbours of the escaped ranges, a backslash and text a person writes. */
export const PRINTED_AS_IS: readonly string[] = [
	' ',
	'~',
	'\u{a0}',
	'\u{e9}',
	'\u{2027}',
	'\u{202f}',
	'\u{2065}',
	'\u{206a}',
	'\\',
	'\u{1f600}',
]
