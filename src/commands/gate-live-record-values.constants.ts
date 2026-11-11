/** A colour sequence forged into a record value. */
export const FORGED_COLOUR = '\u001b[31m'

/** The same sequence as the cli prints it when it escapes it. */
export const ESCAPED_FORGED_COLOUR = '\\u{1b}[31m'

/** The `at` value of a forged record: a time with a colour sequence in front of it. */
export const FORGED_AT = `${FORGED_COLOUR}2026-11-10T12:00:00.000Z`

/** The step the record is made of. */
export const PASSING_STEP = { name: 'pass', run: 'true' }

/** The package file a gate runs over. */
export const GATE_FILES = { 'src/a.ts': 'export {}\n' }
