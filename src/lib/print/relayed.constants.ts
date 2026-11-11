/** The end of a line a child process printed: a line feed, with the carriage return of a CRLF. */
export const CHILD_LINE_END_PATTERN = /\r?\n/

/** The escape character that opens a terminal sequence. */
export const ESCAPE_CHARACTER = '\u001b'

/** What follows the escape character in a colour sequence (SGR), and what ends it. */
export const SGR_OPEN = '['
export const SGR_END = 'm'

/** What separates the parameters of a colour sequence. */
export const SGR_SEPARATOR = ';'

/** The characters a colour sequence's parameters are made of: digits and the separator. */
export const SGR_PARAMETER_PATTERN = /^[0-9;]$/

/** The parameter that hides text (conceal), as a number (a terminal reads `08` as 8): dropped from a relayed colour. */
export const CONCEAL_PARAMETER = 8

/**
 * The parameters that open an extended colour, and how many values follow its mode: `5` then one palette index,
 * `2` then three channel values. Those values are colours, never parameters. Numbers, as a terminal reads them.
 */
export const EXTENDED_COLOUR_PARAMETERS: readonly number[] = [38, 48, 58]
export const EXTENDED_COLOUR_VALUE_COUNTS: ReadonlyMap<number, number> = new Map([
	[5, 1],
	[2, 3],
])
