/** What `scratch.json` holds: the process that made the folder, when, and its command line. */
export type ScratchMarker = { pid: number; startedAt: string; command: string }

/** Where the scratch root is read from: the environment and the folder the cli runs in. */
export type ScratchContext = {
	/** The environment whose `DIALECTE_SCRATCH` names the root; default `process.env`. */
	env?: NodeJS.ProcessEnv
	/** The folder whose workspace holds the root; default `process.cwd()`. */
	cwd?: string
	/** The scratch root itself, read by the caller already (`machineScratchRoots`); default: read from `env` and `cwd`. */
	root?: string
}
