/** The parts of a reader test file: its imports and the assertions its one case makes. */
export type ReaderTestParts = {
	imports: string[]
	/** Statements run before the assertions (a glob call, for one). */
	setup?: string[]
	assertions: string[]
}
