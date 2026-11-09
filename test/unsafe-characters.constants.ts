/** How the escape character and the right-to-left override of the hostile text print once escaped. */
export const ESCAPED_ESCAPE = '\\u{1b}[2J'
export const ESCAPED_OVERRIDE = '\\u{202e}'
export const ESCAPED_LINE_FEED = '\\u{a}'

/** The report of a text that is safe, whose hostile part held an escape sequence and an override. */
export const ESCAPED_SAFE = { unsafe: [], showsEscapes: true, showsLineFeed: false }

/** The same, whose hostile part also held a line feed. */
export const ESCAPED_SAFE_WITH_LINE_FEED = { ...ESCAPED_SAFE, showsLineFeed: true }
