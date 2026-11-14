/** The lines a change adds to each file: their numbers, or `'whole'` for a file the base does not hold. */
export type AddedLines = Map<string, ReadonlySet<number> | 'whole'>
