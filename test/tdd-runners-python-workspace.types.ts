/** The files of a scratch python package: those its first commit holds, and those written in the working tree after. */
export type PythonPackageParts = {
	committed?: Record<string, string>
	written?: Record<string, string>
}

/** A shell script standing for a python interpreter, written as `<folder>/.venv/bin/python`. */
export type InterpreterScript = {
	/** The package root. */
	root: string
	/** The pytest folder, relative to the root ('' for the root itself). */
	folder: string
	/** The script text (a shell script). */
	script: string
}
