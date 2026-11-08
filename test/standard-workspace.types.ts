/** The standards of a root: per standard folder, its files by name (`one.md`) with their text. */
export type StandardsDescription = Record<string, Record<string, string>>

/** The temporary tree a standard command is run in: nothing of it is the real home, cache or standard. */
export type StandardWorkspace = {
	base: string
	/** The folder `DIALECTE_STANDARD` names. */
	root: string
	/** The folder `XDG_CACHE_HOME` names. */
	cache: string
	/** The folder the command runs in: a package without a dependency. */
	cwd: string
	home: string
	environment: NodeJS.ProcessEnv
}

/** One file of `index --json`. */
export type StandardIndexJsonFile = {
	id: string
	lines: number
	verdict: string
	noiseRatio: number
	headings: { kept: number; candidates: number }
	tables: number
	definitions: number
	repeatedLines: unknown[]
}

/** What `index --json` prints. */
export type StandardIndexJson = {
	standards: Array<{
		id: string
		manifest: string
		state: string
		skipped: boolean
		files: StandardIndexJsonFile[]
	}>
}

/** What `find --json` prints. */
export type StandardFindJson = {
	query: string
	about?: string | null
	slices: Array<{
		file: string
		from: number
		to: number
		clause: string | null
		title: string | null
		score: number
		terms: string[]
		linked: boolean
	}>
}

/** What `show --json` prints. */
export type StandardShowJson = {
	file: string
	from: number
	to: number
	lines: Array<{ from: number; to: number; kind: string; text: string }>
}

/** What `eval --json` prints. */
export type StandardEvalJson = {
	vocabulary: { packages: string[] }
	items: number
	notInText: number
	recallAt5: number
	recallAt10: number
	misses: Array<{ question: string; file: string; quote: string; why: string }>
}
