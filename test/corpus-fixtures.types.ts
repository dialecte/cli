/** One member of a built fixture archive: its name as the archive stores it, and its text. */
export type ArchiveMember = {
	name: string
	text: string
}

/** A local HTTP server serving fixed bytes by path; every requested path recorded. */
export type FixtureServer = {
	/** The full URL of a path served (or not) by this server. */
	urlOf: (path: string) => string
	requests: string[]
	close: () => Promise<void>
}

/** The folders a corpus command test runs with, and its environment (cache, personal config folder, home). */
export type CorpusWorkspace = {
	root: string
	cache: string
	home: string
	configHome: string
	environment: Record<string, string | undefined>
}
