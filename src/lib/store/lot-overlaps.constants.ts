/** The version of an `overlaps.jsonl` line. */
export const LOT_OVERLAP_SCHEMA = 1

/** The most bytes one append of `overlaps.jsonl` may hold (one atomic append, as a scope change). */
export const LOT_OVERLAP_LINE_LIMIT = 4_096

/** Why the records of one call do not fit one append: `{message}` the size against the limit. */
export const LOT_OVERLAP_OVER_LIMIT = 'overlaps.jsonl: {message}'

/** The keys an `overlaps.jsonl` line holds, each one required. */
export const LOT_OVERLAP_KEYS: readonly string[] = [
	'schema',
	'at',
	'verb',
	'lot',
	'met',
	'by',
	'reason',
]

/** The key a record may hold beside them: the damage of a damaged other lot the go-ahead accepted (33CO behaviour 15). */
export const LOT_OVERLAP_OPTIONAL_KEYS: readonly string[] = ['damage']

/** How a record names a damaged other lot. */
export const LOT_OVERLAP_DAMAGED_LOT = '{lot} (damaged: {damage})'

/** The verb of an undo line: the add an overlap was recorded with was taken back. */
export const LOT_OVERLAP_UNDO_VERB = 'undo'

/** The keys an undo line holds, each one required: the record it cancels is the newest of the same lot and pairs. */
export const LOT_OVERLAP_UNDO_KEYS: readonly string[] = ['schema', 'at', 'verb', 'lot', 'met']

/** The verbs that accept an overlap. */
export const LOT_OVERLAP_VERBS: readonly string[] = ['start', 'scope']

/** The text of one recorded overlap: the lot, its met pairs, who accepted it and why. */
export const LOT_OVERLAP_TEXT = 'overlaps {lot}: {met} (by {by}: {reason})'

/** Between two met pairs of one overlap. */
export const LOT_OVERLAP_MET_SEPARATOR = '; '

/** Between two overlaps, and between the scope changes and the overlaps on the card's scope line. */
export const LOT_OVERLAP_SEPARATOR = ' · '

/** After the overlaps on the card: `{count}` lines of `overlaps.jsonl` that do not read. */
export const LOT_OVERLAP_UNREADABLE = '{count} line(s) of overlaps.jsonl do not read'
