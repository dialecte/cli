/** The name of the log in the registry folder, beside the registry entries. */
export const CARDS_LOG_FILE = 'cards.log'

/** The most bytes one `cards.log` line may hold. */
export const CARDS_LOG_LINE_LIMIT = 65_536

/** A card's `tdd` lines and file lists are cut after this many entries. */
export const CARDS_LOG_CUT_LIMIT = 40

/** The schema version of every line. */
export const CARDS_LOG_SCHEMA = 1

/** The kind of a lot's final record. */
export const CARD_KIND = 'card'

/** The kind of the intent line written before an item is moved. */
export const REMOVING_KIND = 'removing'

/** The kind of the outcome line written after the move, joined to its intent by `id`. */
export const REMOVED_KIND = 'removed'

/** The fields a `card` line must hold (any of them may be `null`); a line without one is damaged. */
export const CARD_REQUIRED_FIELDS: readonly string[] = ['at', 'lot', 'name', 'state', 'head']

/** The fields a `removing` line must hold; a line without one is damaged. */
export const REMOVING_REQUIRED_FIELDS: readonly string[] = ['id', 'at', 'lot', 'item', 'path']

/** The fields a `removed` line must hold; a line without one is damaged. */
export const REMOVED_REQUIRED_FIELDS: readonly string[] = ['id', 'outcome']

/** The outcome of a removal whose intent line has no outcome line (a crash). */
export const UNKNOWN_OUTCOME = 'unknown'
