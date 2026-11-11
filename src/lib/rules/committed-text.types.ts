/** A pattern of text that must not be committed: a plan or ticket tag, a citation of a standard. */
export type ReferencePattern = {
	/** What the pattern finds, shown in a finding: `ticket number`. */
	label: string
	/** A JavaScript regular expression; each generic one also reads the same in `grep -E` (a test holds it to that). */
	source: string
	/**
	 * Its first group is the boundary before the reference (`grep -E` has no lookbehind): a match is
	 * reported from the end of that group.
	 */
	leadingBoundary?: boolean
	/** Matched whatever the case (the forbidden words). */
	ignoreCase?: true
	/** Read with the `u` flag: its source holds Unicode property escapes (whole words of any script). */
	unicode?: true
	/** A package may allow it (`"dialecte": { "allowReferences" }`): a tag, never a citation of a standard. */
	allowable?: true
}

/** A contributor's machine lists, as a reuse key folds them in (`readMachineLists`): never committed. */
export type MachineLists = {
	consumerNames: string[]
	/** The merged words, or the list file that cannot be read. */
	forbiddenWords: string[] | { unreadable: string }
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
