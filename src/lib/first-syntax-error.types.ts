/** The first syntax error of a file: where it is (1-based) and what the parser says. */
export type FirstSyntaxError = {
	line: number
	column: number
	message: string
}
