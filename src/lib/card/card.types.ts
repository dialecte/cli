/** A boxed card: a title, then rows of a label and its lines (aligned under the first). */
export type CardRow = { label: string; lines: string[] }

export type Card = { title: string; rows: CardRow[] }
