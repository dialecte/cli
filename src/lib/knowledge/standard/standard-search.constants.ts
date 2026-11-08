/**
 * The words, weights and limits the search over a standard index uses: the word index, the tag links,
 * find's scores and slices, and the gold evaluation.
 */

/** A word: a run of letters, digits and underscores. */
export const WORD_TOKEN_PATTERN = /[A-Za-z0-9_]+/g

/** The places a word is split into its parts: underscores and camel case boundaries. */
export const WORD_PART_SEPARATOR = '_'

export const CAMEL_CASE_BOUNDARY_PATTERN = /(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/

/** A word shorter than this is not indexed (a vocabulary name is linked whatever its length). */
export const MINIMUM_WORD_LENGTH = 3

/** A vocabulary name in lowercase letters only: from the minimum word length, a query searches it as a word. */
export const LOWERCASE_WORD_PATTERN = /^[a-z]+$/u

/**
 * A word written in capitals and digits only, with at least two capitals: an acronym, kept whatever its
 * length, never stemmed nor taken for a stop word.
 */
export const ACRONYM_PATTERN = /^(?=(?:\d*[A-Z]){2})[A-Z\d]+$/u

/** The plural of an acronym: the acronym and one lowercase `s` (the acronym checked once the `s` is cut). */
export const ACRONYM_PLURAL_PATTERN = /^[A-Z\d]+s$/u

/**
 * English words too common to search by, the modal and question words among them (lowercase: an acronym
 * is never one). Words shorter than the minimum length are dropped anyway.
 */
export const STOP_WORDS: ReadonlySet<string> = new Set([
	'about',
	'above',
	'after',
	'again',
	'against',
	'all',
	'and',
	'any',
	'are',
	'because',
	'been',
	'before',
	'being',
	'below',
	'between',
	'both',
	'but',
	'can',
	'could',
	'did',
	'do',
	'does',
	'doing',
	'down',
	'during',
	'each',
	'few',
	'for',
	'from',
	'further',
	'had',
	'has',
	'have',
	'having',
	'her',
	'here',
	'hers',
	'him',
	'his',
	'how',
	'into',
	'its',
	'itself',
	'may',
	'might',
	'more',
	'most',
	'must',
	'nor',
	'not',
	'off',
	'once',
	'only',
	'onto',
	'other',
	'our',
	'ours',
	'out',
	'over',
	'own',
	'same',
	'shall',
	'she',
	'should',
	'some',
	'such',
	'than',
	'that',
	'the',
	'their',
	'theirs',
	'them',
	'then',
	'there',
	'these',
	'they',
	'this',
	'those',
	'through',
	'too',
	'under',
	'until',
	'upon',
	'very',
	'was',
	'were',
	'what',
	'when',
	'where',
	'which',
	'while',
	'who',
	'whom',
	'whose',
	'why',
	'will',
	'with',
	'within',
	'without',
	'would',
	'you',
	'your',
	'yours',
])

/** The stemming rule, applied in this order: `ies` to `y`, then `es` after these endings, then a final `s`. */
export const PLURAL_IES_PATTERN = /ies$/

export const PLURAL_IES_REPLACEMENT = 'y'

export const PLURAL_ES_PATTERN = /(s|x|z|ch|sh)es$/

export const PLURAL_ES_REPLACEMENT = '$1'

/** A final `s` is dropped unless the word ends in `ss`, `us` or `is`. */
export const PLURAL_S_PATTERN = /([^sui])s$/

export const PLURAL_S_REPLACEMENT = '$1'

/** After the plural: `ied` to `y`, else `ying` to `y` (the `y` kept), else a final `ing` or `ed`. */
export const PAST_IED_PATTERN = /ied$/u

export const PAST_IED_REPLACEMENT = 'y'

export const PROGRESSIVE_YING_PATTERN = /(?<=y)ing$/u

export const INFLECTION_PATTERN = /(?:ing|ed)$/u

/**
 * The shortest stem: a final `ing` or `ed` is removed only when the rest is this long and holds a vowel,
 * a final `e` only when the word stays this long.
 */
export const STEM_MINIMUM_LENGTH = 3

export const STEM_VOWEL_PATTERN = /[aeiouy]/u

/** A doubled final consonant left by a removed `ing` or `ed` is undoubled, but `l`, `s` and `z`. */
export const DOUBLED_CONSONANT_PATTERN = /([bcdfghjkmnpqrtvwx])\1$/u

export const DOUBLED_CONSONANT_REPLACEMENT = '$1'

export const FINAL_E_PATTERN = /e$/u

/** A word held by more than this share of the logical lines is scored low: its weight times the factor. */
export const COMMON_WORD_SHARE = 0.05

export const COMMON_WORD_WEIGHT_FACTOR = 10

/** How strongly a vocabulary name links a unit, by where it is named. */
export const LINK_STRENGTHS = {
	heading: 3,
	caption: 3,
	definition: 2,
	cell: 2,
	text: 1,
} as const

/**
 * An attribute name shorter than this links only as `@name`, `name=`, or a table cell equal to it; an
 * enumeration value shorter than this only as a table cell equal to it.
 */
export const SHORT_ATTRIBUTE_LENGTH = 3

export const ATTRIBUTE_AT_SIGN = '@'

export const ATTRIBUTE_EQUAL_SIGN = '='

/** A term that hits the heading title or caption of a unit counts this many times. */
export const TITLE_HIT_FACTOR = 2

/** The tag find is about counts this many times. */
export const ABOUT_FACTOR = 2

/** Scores are rounded to this many decimals, and compared rounded. */
export const SCORE_DECIMALS = 2

/** A slice holds at most this many non-noise original lines. */
export const SLICE_LINE_CAP = 60

/** The direct slices find gives when no limit is asked (and at most as many linked slices). */
export const DEFAULT_FIND_LIMIT = 10

/** The ranks recall is measured at. */
export const RECALL_RANKS = { near: 5, far: 10 } as const

/** Why an expected quote was missed. */
export const MISS_REASONS = {
	notInText: 'not in the text',
	notFound: 'not found by find',
	ranked: 'ranked',
	unknownFile: 'unknown file',
} as const

/**
 * The markup a quote is compared without, on both sides: a `<br>` tag and a table pipe (each to a space),
 * a `**` or `__` run, a leading `#` run.
 */
export const MATCH_BREAK_TAG_PATTERN = /<br\s*\/?>/giu
export const MATCH_TABLE_PIPE_PATTERN = /\|/gu
export const MATCH_EMPHASIS_PATTERN = /\*\*|__/gu
export const MATCH_HEADING_MARKER_PATTERN = /^\s*#+\s*/u

/**
 * How good the reason of a missed quote is, best first: an item's alternatives report the quote that came
 * closest (ranked, then in the text, then not in it, then an unknown file).
 */
export const MISS_REASON_ORDER = ['ranked', 'notFound', 'notInText', 'unknownFile'] as const
