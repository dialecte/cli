/** A colour sequence and a line feed inside an outside value (a path, an error message). */
export const FORGED_COLOUR = '\u001b[31m'
export const ESCAPED_FORGED_COLOUR = '\\u{1b}[31m'
export const FORGED_NAME_PART = `x${FORGED_COLOUR}y`
export const ESCAPED_NAME_PART = `x${ESCAPED_FORGED_COLOUR}y`
export const FORGED_LINE_FEED = 'x\ny'
export const ESCAPED_LINE_FEED = 'x\\u{a}y'

/** The values a case forges: the colour form and the line feed form. */
export const FORGED_VALUES = [
	{ title: 'a colour sequence', forged: FORGED_NAME_PART, escaped: ESCAPED_NAME_PART },
	{ title: 'a line feed', forged: FORGED_LINE_FEED, escaped: ESCAPED_LINE_FEED },
] as const

/** The package the scoped tests entry runs over. */
export const SCOPED_PACKAGE_FILES = {
	'package.json': `${JSON.stringify({ name: 'demo', type: 'module' }, null, '\t')}\n`,
	'.gitignore': 'node_modules\n',
}

/** The bound on the spawned entry. */
export const ENTRY_BOUND_MS = 90_000

/** The reuse of the rehearsal's lot: the error the relink seam throws, and the lines it ends in. */
export const NOT_PARKED_START = 'node_modules not parked:'
export const TRASH_LINE_START = 'sent the rehearsal folder to the trash:'
