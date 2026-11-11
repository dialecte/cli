/**
 * The code points a terminal acts on or that reorder text, as inclusive ranges, listed here on their own (never read
 * from the production registry, so a wrong registry cannot excuse itself). The line feed is left out: the lines a
 * command prints are its own, and a forged line is caught by its content.
 */
export const UNSAFE_CODE_POINTS: ReadonlyArray<readonly [number, number]> = [
	[0x00, 0x09],
	[0x0b, 0x1f],
	[0x7f, 0x9f],
	[0x061c, 0x061c],
	[0x200e, 0x200f],
	[0x2028, 0x2029],
	[0x202a, 0x202e],
	[0x2066, 0x2069],
]
