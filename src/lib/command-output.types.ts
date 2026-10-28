/** What a lookup command answers: the text it prints and its exit code (0 answer, 1 nothing found, 2 usage). */
export type CommandOutput = {
	output: string
	exitCode: 0 | 1 | 2
}
