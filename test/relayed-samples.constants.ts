import type { RelayedSample } from './relayed-samples.types.ts'

/** Colour sequences that pass unchanged: every one is `ESC [`, digits and `;`, then `m`. */
export const KEPT_SGR_SAMPLES: readonly RelayedSample[] = [
	{ title: 'a bare reset', line: 'a\u001b[mb', printed: 'a\u001b[mb' },
	{ title: 'the zero reset', line: 'a\u001b[0mb', printed: 'a\u001b[0mb' },
	{ title: 'bold green', line: 'a\u001b[1;32mb', printed: 'a\u001b[1;32mb' },
	{ title: 'a 256 colour', line: 'a\u001b[38;5;196mb', printed: 'a\u001b[38;5;196mb' },
	{ title: 'a truecolour', line: 'a\u001b[38;2;1;2;3mb', printed: 'a\u001b[38;2;1;2;3mb' },
	{
		title: 'two colours around a word',
		line: '\u001b[31mfail\u001b[0m ok',
		printed: '\u001b[31mfail\u001b[0m ok',
	},
]

/** Every other control is escaped as `textOf` does: the escape character, then the rest as plain text. */
export const ESCAPED_RELAYED_SAMPLES: readonly RelayedSample[] = [
	{ title: 'a cursor move', line: 'a\u001b[2Ab', printed: 'a\\u{1b}[2Ab' },
	{ title: 'an erase of the screen', line: 'a\u001b[2Jb', printed: 'a\\u{1b}[2Jb' },
	{ title: 'an erase of the line', line: 'a\u001b[Kb', printed: 'a\\u{1b}[Kb' },
	{
		title: 'a link closed by a string terminator',
		line: '\u001b]8;;url\u001b\\x',
		printed: '\\u{1b}]8;;url\\u{1b}\\x',
	},
	{
		title: 'a link closed by a bell',
		line: '\u001b]8;;url\u0007x',
		printed: '\\u{1b}]8;;url\\u{7}x',
	},
	{ title: 'a bare carriage return', line: 'a\rb', printed: 'a\\u{d}b' },
	{ title: 'a lone escape at the end', line: 'a\u001b', printed: 'a\\u{1b}' },
	{
		title: 'a colour look-alike with a question mark',
		line: 'a\u001b[1;?mb',
		printed: 'a\\u{1b}[1;?mb',
	},
	{
		title: 'a colour look-alike with a colon',
		line: 'a\u001b[1:2mb',
		printed: 'a\\u{1b}[1:2mb',
	},
	{ title: 'a line feed inside a line', line: 'a\nb', printed: 'a\\u{a}b' },
	{ title: 'a right-to-left override', line: 'a\u{202e}b', printed: 'a\\u{202e}b' },
	{ title: 'a left-to-right isolate', line: 'a\u{2066}b', printed: 'a\\u{2066}b' },
	{
		title: 'a colour followed by a cursor move',
		line: '\u001b[32mok\u001b[2A',
		printed: '\u001b[32mok\\u{1b}[2A',
	},
]

/** The conceal parameter (8) is dropped so no relayed text hides; a colour value or another parameter that holds an 8 stays. */
export const CONCEAL_SAMPLES: readonly RelayedSample[] = [
	{ title: 'the conceal sequence alone', line: 'a\u001b[8mhidden', printed: 'ahidden' },
	{ title: 'conceal between two parameters', line: 'a\u001b[1;8;32mb', printed: 'a\u001b[1;32mb' },
	{
		title: 'the colour value 8 of a 256 colour',
		line: 'a\u001b[38;5;8mb',
		printed: 'a\u001b[38;5;8mb',
	},
	{
		title: 'the colour value 8 of a truecolour',
		line: 'a\u001b[48;2;8;8;8mb',
		printed: 'a\u001b[48;2;8;8;8mb',
	},
	{ title: 'the parameter 28', line: 'a\u001b[28mb', printed: 'a\u001b[28mb' },
]
