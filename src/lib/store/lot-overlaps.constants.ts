/** The version of an `overlaps.jsonl` line. */
export const LOT_OVERLAP_SCHEMA = 1

/** The most bytes one append of `overlaps.jsonl` may hold (one atomic append, as a scope change). */
export const LOT_OVERLAP_LINE_LIMIT = 4_096

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

/** The verbs that accept an overlap. */
export const LOT_OVERLAP_VERBS: readonly string[] = ['start', 'scope']

/** The text of one recorded overlap: the lot, its met pairs, who accepted it and why. */
export const LOT_OVERLAP_TEXT = 'overlaps {lot}: {met} (by {by}: {reason})'

/** Between two met pairs of one overlap; between two overlaps, and after the scope changes on the card's scope line. */
export const LOT_OVERLAP_MET_SEPARATOR = '; '
export const LOT_OVERLAP_SEPARATOR = ' · '
