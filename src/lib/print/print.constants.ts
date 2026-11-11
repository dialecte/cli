/**
 * The characters a printed line shows escaped (33S case 40), as ranges of code points, both ends included: C0
 * controls (tab and line feed included), DEL and C1 controls, the Arabic letter mark, the bidi marks, the line and
 * paragraph separators, the bidi embeddings and overrides, the bidi isolates.
 */
export const DISPLAY_ESCAPED_RANGES: ReadonlyArray<readonly [number, number]> = [
	[0x00, 0x1f],
	[0x7f, 0x9f],
	[0x61c, 0x61c],
	[0x200e, 0x200f],
	[0x2028, 0x2029],
	[0x202a, 0x202e],
	[0x2066, 0x2069],
]

/** The radix an escaped character's code is written in. */
export const ESCAPE_RADIX = 16

/** What separates the lines of a printed text. */
export const LINE_FEED = '\n'

/** What puts the cursor back at the start of a line refreshed in place. */
export const CARRIAGE_RETURN = '\r'

/** The descriptor of each stream, for a synchronous write (`printOut` with `synchronous`). */
export const STREAM_DESCRIPTORS = { stdout: 1, stderr: 2 } as const
