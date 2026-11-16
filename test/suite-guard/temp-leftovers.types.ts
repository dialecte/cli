/** One leftover entry of the suite's temporary folder, as the guard names it. */
export type Leftover = {
	name: string
	/** The test that made it (`<test file> > <test name>`), when `temporaryFolder` recorded one. */
	origin?: string
	/** The first paths it holds, relative to it: what wrote into it. Empty for a file or an empty folder. */
	holds: readonly string[]
	/** `<pid> <command line>` of the processes still holding it (working folder or open file); none named when empty. */
	holders: readonly string[]
}

/** The processes holding `path` (the guard's default reads /proc or lsof; the tests stand in for it). */
export type HoldersReader = (params: { path: string }) => string[]
