/** The flags of `dialecte fixture` that take a value. */
export const FIXTURE_VALUE_FLAGS: ReadonlySet<string> = new Set(['under', 'package', 'out'])

/** The flags of `dialecte fixture` that stand alone. */
export const FIXTURE_BOOLEAN_FLAGS: ReadonlySet<string> = new Set(['json'])

/** What ends a line of the exported document (it may end its lines with a carriage return too). */
export const XML_LINE_BREAK_PATTERN = /\r?\n/

export const FIXTURE_USAGE =
	'usage: dialecte fixture <Tag> [--under A/B] [--package <name>] [--out <file>] [--json]'
