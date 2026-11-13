/** The test calls of a scenario's test file, each written as one line of the suite's body. */
export type ZeroCaseTestParts = {
	suite?: string
	/** The lines inside the suite, for instance `it('a', () => { expect(1).toBe(2) })` or `it.skip(...)`. */
	body: string[]
}
