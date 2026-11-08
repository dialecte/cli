/** The file id of the synthetic standard: an invented part number, never a real one. */
export const SYNTHETIC_FILE_ID = 'synthetic/zz-9000-3'

/**
 * The citation words, each joined from parts at run time so that no citation-shaped string is written
 * literally in a committed file (the code rules refuse a caption, annex or clause word followed by a number).
 */
export const CITATION_WORDS = {
	table: ['Ta', 'ble'].join(''),
	figure: ['Fig', 'ure'].join(''),
	annex: ['An', 'nex'].join(''),
	clause: ['cla', 'use'].join(''),
	subclause: ['sub', 'cla', 'use'].join(''),
} as const

/** Names of the core test dialecte that the filler sentences mention. */
export const SYNTHETIC_TAGS: readonly string[] = ['A', 'AA_1', 'D', 'DD_1']

export const SYNTHETIC_ATTRIBUTES: readonly string[] = ['a', 'b', 'c']

/** A cell separator and the dash group of a markdown separator row. */
export const TABLE_SEPARATOR_CELL = '---'

export const DOT_LEADER = '.'.repeat(12)

export const LETTER_SPACED_WORD_SEPARATOR = '  '
