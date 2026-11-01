/** A boxed card: a title, then rows of a label and its lines (aligned under the first). */
export type CardRow = { label: string; lines: string[] }

export type Card = { title: string; rows: CardRow[] }

/** How a terminal shows a line's first word: a gate mark in its colour, or a verdict in bold. */
export type CardEmphasis = 'passed' | 'warning' | 'failed' | 'strong'

/**
 * One line of a sectioned card: its text (leading spaces kept), the column its wrapped continuation lines
 * start at, and how its first word is shown on a terminal; a mark at the right edge of its first row
 * (`trailing`); kept to one row, cut after its last whole word that fits with `…` (`cut`).
 */
export type CardLine = {
	text: string
	hang: number
	emphasis?: CardEmphasis
	trailing?: string
	cut?: boolean
	/**
	 * When the room its hang leaves is below the least: the text before the hang column (the lead) on a row of
	 * its own and the rest under it, a few columns in, wrapped to the full width (a commit line's message).
	 */
	stack?: boolean
	/** The text without the layout put in it (a label's padding, a count's alignment), for data. */
	plain?: string
}

/** A part of a sectioned card: opened by a `├─ <name> ─┤` rule, the first one (no name) by the title. */
export type CardSection = { name?: string; lines: CardLine[] }

/** A card in sections: a title, its sections, and the text of the closing rule. */
export type SectionCard = { title: string; sections: CardSection[]; footer: string }

/**
 * A line of a sectioned card's box as printed: its text (the frame left out), its first word's emphasis,
 * and the mark at its right edge.
 */
export type BoxRow = { text: string; emphasis?: CardEmphasis; trailing?: string }

/** A rule of the box: its border line for a text width, and the rows its text spills into when it does not fit. */
export type BoxRule = { border: (inner: number) => string; overflow: BoxRow[] }
