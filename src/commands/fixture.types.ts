import type { CommandOutput } from './run.types.ts'

export type FixtureCommandParams = {
	argv: string[]
	cwd: string
	output: CommandOutput
}

/** The options of `dialecte fixture`, read from the command line. */
export type FixtureOptions = {
	tagName: string
	/** The tags from the root (which may be left out) down to the parent of the asked element. */
	under?: string[]
	packageName?: string
	outPath?: string
	json: boolean
}
