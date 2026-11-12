/** What `lot export --json` answers (33L0 section 9.6). */
export type LotExportJson = {
	/** The folder the lot was copied to: `<dir>/<full name>`. */
	exported: string
	/** The files and links of the copy (folders are not counted), `cards.log` and `registry.json` included. */
	files: number
	/** The bytes of the copied files. */
	bytes: number
	/** What was left out of the copy: `asks/` when the lot has one. */
	skipped: string[]
	/**
	 * The links of the lot whose resolved target lies outside the lot folder, absolute or relative: `path` relative to
	 * the lot folder, `target` the link text as written. They are copied as links, never followed.
	 */
	links: { path: string; target: string }[]
}

/** Where a file was copied: the test seam called after each copy of a file (the first copy and the one retry). */
export type FileCopiedSeam = (params: {
	/** The file's path relative to the lot folder (`cards.log` and `registry.json` for the two added ones). */
	path: string
	/** 1 for the first copy, 2 for the copy made after a difference. */
	attempt: number
}) => void

/** The call of `lot export`. */
export type LotExportParams = {
	cwd: string
	/** The words after the verb: `<id> <dir>` and `--json`. */
	argv: string[]
	/** Called after each file is copied, before the copy is compared with the source (a test changes the source here). */
	afterFileCopied?: FileCopiedSeam
}
