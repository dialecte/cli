/** Where git looks for a repository's hooks. */
export type HooksFolder = {
	/** `core.hooksPath` as configured, or undefined for git's own `hooks` folder. */
	configured: string | undefined
	/** Absolute path of the folder. */
	folder: string
}
