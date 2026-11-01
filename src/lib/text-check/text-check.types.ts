/** What `dialecte text check` reads of a GitHub text and what it finds wrong. */

/** The kind of GitHub text: its headings and its word cap. */
export type TextKind = 'pr' | 'issue' | 'comment' | 'commit'

/** One line of the human part, as the checks read it. */
export type TextLine = {
	/** 1-based line number in the file. */
	number: number
	/** The line without its line end. */
	text: string
	/** Inside a fenced code block, its fence lines included: never a heading, never counted. */
	fenced: boolean
	/** The heading's text (trailing `#`s and spaces dropped) when the line is an ATX heading. */
	heading?: string
}

/** A problem found at a line, or (no line) a required heading that is missing. */
export type TextProblem = {
	line?: TextLine
	what: string
}

/** The word cap passed: the count, the cap, the lines from the one that passed it to the last word. */
export type OverCap = {
	words: number
	cap: number
	lines: TextLine[]
}

/** The checks of a text: the words counted, the cap, the problems in report order. */
export type TextCheck = {
	words: number
	cap: number
	/** The line problems in line order, then the missing headings. */
	problems: TextProblem[]
	overCap?: OverCap
}
