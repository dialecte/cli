/** Where a floor came from: the cli repository's own version, a package's pin, or the installed cli a non-range pin names. */
export type CliFloorSource = 'own' | 'pin' | 'installed'

/** The version a repository asks the running cli to be at least, and where it says so. */
export type CliFloor = {
	version: string
	source: CliFloorSource
	/** The package root the floor was read in. */
	root: string
	/** The dependency field and its spec, for a `pin` or `installed` floor. */
	field?: string
	spec?: string
	/** The base branch the floor was read at, when the working tree's floor was not the one used. */
	branch?: string
}

/** The cli that runs: its version (undefined when unreadable) and the path it was started by and its real path. */
export type RunningCli = {
	version: string | undefined
	invokedPath: string
	realPath: string
}

/** A command the cli floor guards: its refusal and hints name it. */
export type FloorCommand = 'lot' | 'tdd' | 'handover'
