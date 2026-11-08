import type {
	StandardFileIndex,
	StandardLogicalLine,
	StandardOriginalRange,
} from './standard-index.types.ts'
import type { MISS_REASON_ORDER } from './standard-search.constants.ts'

/**
 * The tags, attributes and enumeration values of the selected dialectes' definitions: the names the tag
 * links are made of.
 */
export type StandardVocabulary = {
	tags: string[]
	attributes: string[]
	values: string[]
}

/**
 * What a unit of search is: a clause's own lines (to its first child heading) minus its tables and
 * their captions, a table with its caption, or the lines before the first heading of a file.
 */
export type StandardUnitKind = 'clause' | 'table' | 'front'

/**
 * A unit find scores. Lines are numbered across the standard: the logical lines of its files one after
 * the other, in the order of `files` (a "standard line"). `from`/`to` are original lines of its file;
 * `firstLine`/`lastLine` the standard lines of its first and last logical line (a heading, a caption or
 * a table's first row first); `titleLine` the standard line of its heading or caption, null when none.
 * `clause` is the number of the heading holding it (null for front matter and a table outside every
 * clause), `title` the heading title or the caption (null when none), `target` the cross-reference
 * target naming it (a heading number, or the table prefix and the caption number; null when none).
 */
export type StandardUnit = {
	fileId: string
	kind: StandardUnitKind
	clause: string | null
	title: string | null
	target: string | null
	from: number
	to: number
	firstLine: number
	lastLine: number
	titleLine: number | null
}

/** The units of a standard and, per standard line, the index of the unit it belongs to. */
export type StandardUnits = {
	units: StandardUnit[]
	lineUnits: number[]
}

/**
 * The word index of one standard: per stem, the standard lines holding it in increasing order (their
 * count is the stem's document frequency), and the count of logical lines of the whole standard.
 */
export type StandardWordIndex = {
	logicalLineCount: number
	stems: Record<string, number[]>
}

/**
 * A vocabulary name linked to a unit (its index in `units`): the strength of its strongest hit (3, 2
 * or 1) and the standard lines of the unit where it is named.
 */
export type StandardTagLink = {
	unit: number
	strength: number
	lines: number[]
}

/** Vocabulary name (case kept) to the units it links. Empty when the vocabulary is empty. */
export type StandardTagLinks = Record<string, StandardTagLink[]>

/**
 * The search structures of one standard: its files, the word index (independent of the vocabulary),
 * the units and the tag links of the vocabulary. Plain data, so it can be written as JSON and read back.
 */
export type StandardSearchIndex = StandardUnits & {
	files: StandardFileIndex[]
	vocabulary: StandardVocabulary
	words: StandardWordIndex
	tagLinks: StandardTagLinks
}

export type UnitsOfParams = {
	files: StandardFileIndex[]
}

export type WordIndexOfParams = {
	files: StandardFileIndex[]
}

export type TagLinksOfParams = StandardUnits & {
	files: StandardFileIndex[]
	vocabulary: StandardVocabulary
}

/** A query term: as typed, how it scores (a vocabulary name by its links, a word by its stem), its factor. */
export type StandardQueryTerm = {
	typed: string
	kind: 'name' | 'word'
	key: string
	factor: number
}

/**
 * What a unit scored for a query: its score, which terms hit it, the standard lines of the hits, and per
 * term that hit it what it added to the score and its lines.
 */
export type StandardUnitScore = {
	unit: number
	score: number
	termsHit: boolean[]
	hitLines: number[]
	contributions: StandardTermContribution[]
}

/** A hit of a unit's body: its standard line and the index of its term among the unit's contributions. */
export type StandardWindowHit = {
	line: number
	term: number
}

/** What one query term (its index in the terms) added to a unit's score, and the standard lines it hit. */
export type StandardTermContribution = {
	term: number
	contribution: number
	lines: number[]
}

/** One term's hit in a unit: the unit and the standard lines it hits there. */
export type StandardTermHit = {
	unit: number
	lines: number[]
}

/**
 * How a vocabulary name links: anywhere word-bounded, (a short attribute) only in its own forms or a table
 * cell equal to it, (a short enumeration value) only in a table cell equal to it.
 */
export type StandardNameRule = 'anywhere' | 'attributeForms' | 'cellOnly'

/**
 * One standard as find reads it: its index, its logical lines numbered across the standard, and the
 * dropped runs of each file by file id.
 */
export type StandardSearched = {
	index: StandardSearchIndex
	lines: StandardLogicalLine[]
	noiseRanges: Map<string, StandardOriginalRange[]>
}

/** A slice and where it comes from: the standard (its position in the indexes) and the unit. */
export type StandardRankedSlice = {
	slice: StandardSlice
	standard: number
	unit: number
}

/** A range of standard lines, first and last included. */
export type StandardLineRange = {
	first: number
	last: number
}

/** One answer of find: a range of whole logical lines of one unit, its score, the terms that hit. */
export type StandardSlice = {
	file: string
	from: number
	to: number
	clause: string | null
	title: string | null
	score: number
	terms: string[]
	linked: boolean
}

export type FindInStandardParams = {
	indexes: StandardSearchIndex[]
	query: string
	about?: string
	limit?: number
}

export type SearchIndexOfParams = {
	files: StandardFileIndex[]
	vocabulary: StandardVocabulary
}

export type ShowStandardRangeParams = {
	file: StandardFileIndex
	from: number
	to: number
}

export type StandardShowRefusal = 'from-after-to' | 'beyond-last-line'

/**
 * What showing a range answers: the logical lines overlapping it, nothing (only noise or blank lines
 * in the range), or a refusal (the range is reversed, or ends after the file's last line).
 */
export type StandardShowAnswer =
	| { kind: 'lines'; lines: StandardLogicalLine[] }
	| { kind: 'nothing' }
	| { kind: 'refused'; reason: StandardShowRefusal }

export type StandardGoldExpected = {
	file: string
	quote: string
}

/** One gold item: a question, the tag it is about, and the quotes that answer it (none: not in the text). */
export type StandardGoldItem = {
	question: string
	about?: string
	expected: StandardGoldExpected[]
}

export type StandardMiss = {
	question: string
	file: string
	quote: string
	why: string
}

/** Why a quote was missed, as compared between an item's alternatives: the reason and its rank (ranked only). */
export type StandardMissReason = {
	kind: (typeof MISS_REASON_ORDER)[number]
	rank: number | null
}

/** A quote's miss with the reason it is compared by. */
export type StandardRankedMiss = {
	miss: StandardMiss
	reason: StandardMissReason
}

/** `items` counts the items with expected quotes; `notInText` the ones without, left out of the recall. */
export type StandardEvaluation = {
	items: number
	notInText: number
	recallAt5: number
	recallAt10: number
	misses: StandardMiss[]
}

/** The find an evaluation runs for an item: the item and the answer in rank order, linked after direct. */
export type StandardGoldFind = (params: { item: StandardGoldItem }) => StandardSlice[]

export type EvaluateGoldParams = {
	items: StandardGoldItem[]
	find: StandardGoldFind
	findWide: StandardGoldFind
	files: StandardFileIndex[]
}
