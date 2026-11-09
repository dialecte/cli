/** The command hash a record of each mode must hold to answer for the package now (`readModeCommandHashes`). */
export type ModeCommandHashes = {
	fast: string
	full: string
	/** The commit hook's files, folded with the gate base when the hook's test steps hold a scoped step. */
	hook: string
	/** The release list, its scoped steps against the empty tree. */
	release: string
	/** The release list covers `full`: only then does a release record stand in for a full one. */
	releaseCoversFull: boolean
}
