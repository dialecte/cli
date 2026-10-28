/** Where a command writes: its answer on `stdout`, usage errors and the script's own logs on `stderr`. */
export type CommandOutput = {
	stdout(text: string): void
	stderr(text: string): void
}

export type RunCommandParams = {
	argv: string[]
	cwd: string
	output: CommandOutput
}

/** The options of `dialecte run`, read from the command line. */
export type RunOptions = {
	scriptPath: string
	inputPath?: string
	outPath?: string
	expectPath?: string
	packageName?: string
	prepare: boolean
	json: boolean
	seed: number
	now?: Date
	timeoutInMilliseconds: number
}
