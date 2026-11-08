/** One entry of a listed folder: its name and what it is (a symlink already resolved to its kind). */
export type StandardEntry = {
	name: string
	kind: 'file' | 'folder'
}

/** A kept folder or file: its lowercased id and its name as on disk. */
export type StandardNamed = {
	id: string
	name: string
}

/** The kept ids, in id order, or the two names whose ids collide (in name order). */
export type StandardNamesAnswer =
	| { kind: 'kept'; kept: StandardNamed[] }
	| { kind: 'collision'; names: [string, string] }

/** A file of a standard: its id, its name as on disk and its path (a symlink kept as given). */
export type StandardFile = StandardNamed & {
	path: string
}

/** A standard folder of the root: its id, its name, its path and its files in id order (none: skipped). */
export type StandardFolder = StandardNamed & {
	folder: string
	files: StandardFile[]
}

/** The root and the standards a command works on: the ids of every standard of the root, the selected ones. */
export type StandardInput = {
	root: string
	known: string[]
	selected: StandardFolder[]
}

/** The input read from the environment, or why it is refused (a usage refusal: exit 2). */
export type StandardInputAnswer =
	| { kind: 'input'; input: StandardInput }
	| { kind: 'refused'; message: string }

export type ReadStandardInputParams = {
	environment: NodeJS.ProcessEnv
	/** The standard asked for (`--standard`), matched lowercased; every standard when left out. */
	standardId?: string
}

export type StandardFoldersOfParams = {
	entries: StandardEntry[]
}

export type StandardFilesOfParams = {
	standardId: string
	entries: StandardEntry[]
}
