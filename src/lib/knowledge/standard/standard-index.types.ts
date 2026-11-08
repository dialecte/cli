/** The kinds a line of a standard's markdown file is classified as, one original line at a time. */
export type StandardLineKind =
	| 'blank'
	| 'table'
	| 'code'
	| 'toc'
	| 'heading'
	| 'definition'
	| 'caption'
	| 'prose'

/** One logical line: original lines `from` to `to` (1-based), their kind, and the normalised text. */
export type StandardLogicalLine = {
	from: number
	to: number
	kind: StandardLineKind
	text: string
}

/** A kept heading: `id` is `<file id>#<number>`, with `~<pass>` from the second pass of the file on. */
export type StandardHeading = {
	id: string
	number: string
	title: string
	from: number
	to: number
	depth: number
	parent: string | null
	pass: number
}

export type StandardDefinition = {
	term: string
	number: string
	from: number
	to: number
}

export type StandardTable = {
	id: string
	caption: string | null
	number: string | null
	from: number
	to: number
	clause: string | null
	columns: string[]
}

export type StandardCrossReference = {
	from: number
	inClause: string | null
	target: string
	resolved: boolean
}

/** Information only: a line seen 20 or more times with a median gap of 20 or more lines. Never dropped. */
export type StandardRepeatedLine = {
	text: string
	count: number
	length: number
	medianGap: number
}

export type StandardBlockVerdict = 'good' | 'poor' | 'unreadable'

export type StandardFileVerdict = 'good' | 'partial' | 'unreadable'

/** A block of up to 1,000 original lines: `dropped` lines over `lines` is its noise ratio. */
export type StandardQualityBlock = {
	from: number
	to: number
	lines: number
	dropped: number
	noiseRatio: number
	verdict: StandardBlockVerdict
}

export type StandardQuality = {
	blocks: StandardQualityBlock[]
	verdict: StandardFileVerdict
	readableLines: number
	droppedLines: number
	headingCandidatesKept: number
	headingCandidatesTurnedProse: number
	repeatedLines: StandardRepeatedLine[]
}

/**
 * A heading-shaped line: its number as written (no trailing dot), its title, and its place in tree
 * order. `order` holds the number's parts, an annex letter as a top-level part that sorts after every
 * number; `top` is the top-level number, null for an annex letter.
 */
export type StandardHeadingCandidate = {
	line: number
	number: string
	title: string
	depth: number
	order: number[]
	top: number | null
}

/** A heading candidate the longest tree-consistent sequence keeps, with the pass it belongs to. */
export type StandardKeptCandidate = StandardHeadingCandidate & { pass: number }

/** A definition line: its number and the term written after it on the line (empty when alone). */
export type StandardDefinitionLine = {
	number: string
	term: string
}

/**
 * One original line once classified: its 1-based number, its content (trimmed, leading markdown
 * markers stripped, a letter-spaced line rebuilt) and its kind, with what its kind carries.
 */
export type StandardClassifiedLine = {
	line: number
	content: string
	kind: StandardLineKind
	candidate: StandardHeadingCandidate | null
	definition: StandardDefinitionLine | null
	/** A heading-shaped `1. ` line read as a markdown list item (the file writes its headings otherwise). */
	listItem: boolean
}

/**
 * What classifying a line carries to the next: inside a fence, the terms clause's number, and whether the
 * file's unmarked `1. ` lines are list items.
 */
export type StandardClassifyState = {
	inFence: boolean
	termsClause: string | null
	listItems: boolean
}

/** A caption read from a line: its word and its number as written. */
export type StandardCaption = {
	word: 'table' | 'figure'
	number: string
}

/** A range of original lines of a file, first and last included (1-based). */
export type StandardOriginalRange = {
	from: number
	to: number
}

/** The noise of a file: per original line whether it is dropped, and the range of each dropped run. */
export type StandardNoise = {
	dropped: boolean[]
	ranges: StandardOriginalRange[]
}

/**
 * What indexing one file's text gives: the logical lines and what is read out of them. `noiseRanges`
 * are the dropped one-character runs (the blank lines inside a run included), in file order.
 */
export type StandardFileIndex = {
	fileId: string
	lineCount: number
	logicalLines: StandardLogicalLine[]
	noiseRanges: StandardOriginalRange[]
	headings: StandardHeading[]
	definitions: StandardDefinition[]
	tables: StandardTable[]
	crossReferences: StandardCrossReference[]
	quality: StandardQuality
}
