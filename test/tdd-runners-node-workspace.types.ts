/** The files of a scratch node package: those its first commit holds, and those written in the working tree after. */
export type NodePackageParts = {
	committed?: Record<string, string>
	written?: Record<string, string>
}
