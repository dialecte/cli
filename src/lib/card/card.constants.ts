/** The terminal styles of a card: the colour of each emphasis and the codes that end them. */

/** The ANSI code opening each emphasis. */
export const EMPHASIS_CODES = { passed: 32, warning: 33, failed: 31, strong: 1 } as const

/** The ANSI code closing a colour (default foreground). */
export const COLOUR_RESET_CODE = 39

/** The ANSI code closing bold (normal intensity). */
export const BOLD_RESET_CODE = 22

/** The width of a card off a terminal when `$COLUMNS` is not set. */
export const DEFAULT_CARD_COLUMNS = 80

/** What ends a line cut to fit its row, after its last whole word. */
export const CUT_MARK = '…'

/** The least room between a row's text and the mark at its right edge. */
export const TRAILING_GAP = 2

/**
 * The least room a wrapped card line keeps for its text: a hanging indent that would leave less is reduced, a
 * line marked cut whose cut would keep less after its hang is wrapped instead.
 */
export const MINIMUM_TEXT_COLUMNS = 20

/**
 * Where a row starts when its text leaves its hanging indent: the text of a stacked line under its lead, a
 * word too wide for the room after the hang.
 */
export const STACKED_INDENT = 2
