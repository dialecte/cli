/** A path of the sources that may write to a stream or swap a console without the print module, and why. */
export type WriterException = {
	/** A file, or a folder when it ends with `/`, relative to the package root. */
	path: string
	/** When given, the exception covers only the lines of the path that match it. */
	linePattern?: RegExp
	reason: string
}

/** A line of a sample the scanner is checked on, and whether it must be flagged. */
export type ScannerSample = {
	line: string
	flagged: boolean
}

/** What the guard found: where a stream is written outside the allowed paths, the exceptions that name nothing, the samples the scanner judged wrong. */
export type GuardReport = {
	offenders: string[]
	staleExceptions: string[]
	scannerMisses: string[]
}
