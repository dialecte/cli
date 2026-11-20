/** A line a change added to a changelog fragment or no-entry note to explain its type growth. */
export type TypeCostNote = {
	/** The fragment or note, relative to the package root (`changes/<name>.md`). */
	file: string
	/** Its line number, from 1. */
	line: number
	/** The line as the working file holds it (`- Type cost: <why>` or `Type cost: <why>`). */
	text: string
}

/** What `readTypeCostNotes` answers: the notes, or why the base's fragments cannot be read (no note can count then). */
export type TypeCostNotesRead = TypeCostNote[] | { refusal: string }
