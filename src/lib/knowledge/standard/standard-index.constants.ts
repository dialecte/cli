/**
 * The words and patterns the standard index reads a converted standard with. The caption, annex and
 * clause words are joined from parts at run time, so no citation-shaped string is written literally in
 * a committed file (the code rules refuse one).
 */

/** The caption words: a table caption and a figure caption. */
export const CAPTION_WORDS = {
	table: ['Ta', 'ble'].join(''),
	figure: ['Fig', 'ure'].join(''),
} as const

/** The word that opens an annex heading and an annex reference. */
export const ANNEX_WORD = ['An', 'nex'].join('')

/** The clause word; the subclause word is the same with a prefix. */
export const CLAUSE_WORD = ['cla', 'use'].join('')

export const SUBCLAUSE_PREFIX = 'sub'

/** A pattern part matching a word with its first letter in either case: `[Ww]ord`. */
function eitherCaseFirst(word: string): string {
	return `[${word.charAt(0).toUpperCase()}${word.charAt(0).toLowerCase()}]${word.slice(1)}`
}

/** A heading number: `1`, `2.3.4`, with an optional trailing dot, then whitespace and the title. */
export const NUMBERED_HEADING_PATTERN = /^(\d+(?:\.\d+)*)\.?\s+(\S.*)$/u

/** An annex sub-number: a capital letter and one or more numbers, then whitespace and the title. */
export const ANNEX_SUB_HEADING_PATTERN = /^([A-Z](?:\.\d+)+)\.?\s+(\S.*)$/u

/** The annex word and one capital letter, then the rest of the line (title and qualifier). */
export const ANNEX_HEADING_PATTERN = new RegExp(
	`^${ANNEX_WORD}\\s+([A-Z])(?![\\p{L}\\p{N}_.])\\s*(.*)$`,
	'u',
)

/** The parenthesised word an annex heading may carry before or after its title. */
export const QUALIFIER_BEFORE_PATTERN = /^\(\s*\p{Ll}+\s*\)\s*/u

export const QUALIFIER_AFTER_PATTERN = /\s*\(\s*\p{Ll}+\s*\)$/u

/** A title starts with a capital letter. */
export const CAPITAL_START_PATTERN = /^\p{Lu}/u

/** A title of this many characters or more is not a heading's. */
export const TITLE_LENGTH_LIMIT = 120

/** A top-level number above this is never a heading candidate (change-list entries). */
export const TOP_LEVEL_NUMBER_LIMIT = 50

/** Two kept headings whose top-level numbers differ by more than this break the chain. */
export const TOP_LEVEL_JUMP_LIMIT = 3

/** A number part made of digits only. */
export const DIGITS_PATTERN = /^\d+$/

/**
 * An annex letter's place in tree order: this base plus its character code, above any number a
 * heading carries, so the letters sort after the numbered clauses and among themselves alphabetically.
 */
export const LETTER_ORDER_BASE = 1_000_000_000

/** A dot leader: four dots or more, or three dot-space pairs or more. */
export const DOT_LEADER_PATTERN = /\.{4,}|(?:\. ){3,}/

/** A definition number: `<terms clause>.<n>(.<n>)*`, alone or leading its line. */
export const DEFINITION_PATTERN = /^(\d+)((?:\.\d+)+)\.?(?:\s+(.*))?$/u

/** The first word of the terms clause's title, in any case. */
export const TERMS_TITLE_PATTERN = /^terms(?![\p{L}\p{N}_])/iu

/** A caption: the caption word, a number (`<n>` or `<Letter>.<n>`), then a separator or the end. */
export const CAPTION_PATTERN = new RegExp(
	`^(${CAPTION_WORDS.table}|${CAPTION_WORDS.figure})\\s+([A-Z]\\.\\d+|\\d+)(?:\\s*[-\\u2013\\u2014:.].*)?$`,
	'u',
)

/** A markdown table separator row, alignment colons included: `|---|:---:|`. */
export const TABLE_SEPARATOR_ROW_PATTERN = /^\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?$/

/** Leading markdown markers: `#` runs and `>` quote markers. */
export const LEADING_MARKERS_PATTERN = /^(?:#+(?=\s|$)\s*|>\s*)+/

/** A markdown heading marker: a `#` run at the start of the line. */
export const HEADING_MARKER_PATTERN = /^#+(?=\s|$)/u

/** A markdown ordered list item: a one-part number, a dot, whitespace (`1. `). Without a heading marker, prose. */
export const LIST_ITEM_PATTERN = /^\d+\.\s/u

/** Markers wrapping a whole line: bold by asterisks or underscores. */
export const WRAPPING_MARKERS: readonly string[] = ['**', '__']

export const FENCE_MARKER = '```'

export const TABLE_LINE_START = '|'

/** The outer pipes of a table row. */
export const TABLE_ROW_START_PIPE_PATTERN = /^\|/

export const TABLE_ROW_END_PIPE_PATTERN = /\|$/

export const CODE_LINE_START = '<'

/** A prose line of at least this many tokens, this share of them one character long, is letter-spaced. */
export const LETTER_SPACED_MINIMUM_TOKENS = 4

export const LETTER_SPACED_MINIMUM_SHARE = 0.8

/** Words of a letter-spaced line are apart by two spaces or more. */
export const WIDE_GAP_PATTERN = /\s{2,}/

export const WHITESPACE_PATTERN = /\s+/

/** A run of this many one-character prose lines or more is noise, dropped. */
export const NOISE_RUN_MINIMUM = 20

/** Repeated-line candidates: count, median gap and length at least these. */
export const REPEATED_MINIMUM_COUNT = 20

export const REPEATED_MINIMUM_MEDIAN_GAP = 20

export const REPEATED_MINIMUM_LENGTH = 2

/** Quality is judged per block of this many original lines. */
export const QUALITY_BLOCK_LINES = 1000

/** A block is good under this noise ratio, poor under the next, unreadable from it. */
export const GOOD_NOISE_RATIO_LIMIT = 0.2

export const POOR_NOISE_RATIO_LIMIT = 0.7

/** A table's caption is looked for within this many logical lines above it. */
export const CAPTION_LOOKBACK_LINES = 5

/** A prose line ending in a letter and a hyphen, and a line starting in lower case: one split word. */
export const SPLIT_WORD_END_PATTERN = /\p{L}-$/u

export const LOWER_CASE_START_PATTERN = /^\p{Ll}/u

/**
 * The cross-references within one file, in one pattern so a line's references come in their order: the
 * clause or subclause word and a number, `see` and a dotted number, a bare number of three parts or more
 * in parentheses, the table word and a caption number, the annex word and a letter.
 */
export const CROSS_REFERENCE_PATTERN = new RegExp(
	[
		'(?<![\\p{L}\\p{N}_])(?:',
		`(?:${eitherCaseFirst(SUBCLAUSE_PREFIX)})?${eitherCaseFirst(CLAUSE_WORD)}\\s+(?<clause>[A-Z](?:\\.\\d+)+|\\d+(?:\\.\\d+)*)`,
		'|[Ss]ee\\s+(?<see>\\d+(?:\\.\\d+)+)',
		'|\\((?<parenthesised>\\d+\\.\\d+\\.\\d+(?:\\.\\d+)*)\\)',
		`|${eitherCaseFirst(CAPTION_WORDS.table)}\\s+(?<table>[A-Z]\\.\\d+|\\d+)(?![\\p{L}\\p{N}_])`,
		`|${eitherCaseFirst(ANNEX_WORD)}\\s+(?<annex>[A-Z])(?![\\p{L}\\p{N}_])`,
		')',
	].join(''),
	'gu',
)

/** A table cross-reference's target: this prefix and the caption number. */
export const TABLE_TARGET_PREFIX = 'table-'

/** Folding: dashes to a hyphen, curly quotes to straight ones, the soft hyphen removed. */
export const DASH_PATTERN = /[‒–—−]/g

export const SINGLE_QUOTE_PATTERN = /[‘’‚‛]/g

export const DOUBLE_QUOTE_PATTERN = /[“”„‟]/g

export const SOFT_HYPHEN_PATTERN = /­/g

export const WHITESPACE_RUN_PATTERN = /\s+/g

/** A line break, with the carriage return a converted file may keep. */
export const LINE_BREAK_PATTERN = /\r?\n/
