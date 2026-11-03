/** A pattern of text that must not be committed: a plan or ticket tag, a citation of a standard. */
export type ReferencePattern = {
	/** What the pattern finds, shown in a finding: `ticket number`. */
	label: string
	/** An extended regular expression both JavaScript and `grep -E` read the same way. */
	source: string
	/**
	 * Its first group is the boundary before the reference (`grep -E` has no lookbehind): a match is
	 * reported from the end of that group.
	 */
	leadingBoundary?: boolean
	/** A package may allow it (`"dialecte": { "allowReferences" }`): a tag, never a citation of a standard. */
	allowable?: true
}

export type ReferenceMatch = {
	/** 1-based. */
	line: number
	/** 1-based. */
	column: number
	/** The text that matched. */
	text: string
	label: string
}
