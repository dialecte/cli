/** A file of the lot's tree the findings point at. */
export const TREE_FILE = 'src/reviewed.ts'

/** Text no row may hold: the finding, the note of its fix, the reason of an acceptance, the where of a log. */
export const PRIVATE_TEXT = 'private-words-of-the-review'

/** The row of an open nit of round 1 at `TREE_FILE`: the one finding of the verdict-less cases. */
export const NIT_ROW = {
	schema: 1,
	kind: 'finding',
	id: 'R1-1',
	round: 1,
	severity: 'nit',
	file: TREE_FILE,
	state: 'open',
}
