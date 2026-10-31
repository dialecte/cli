/** The legend of the hand-over card: each term with what it means and whether a person should look. */

/** A term of the card: what it means, then whether to look (`look: ...` or `look only if ...`). */
export type LegendTerm = { term: string; meaning: string; look: string }

/** Terms printed together, a blank line before the next group. */
export type LegendGroup = readonly LegendTerm[]
