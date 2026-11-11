/** An editor the cli knows how to open in a new window: the command word and the flags that ask for one. */
export type EditorCandidate = {
	word: string
	flags: readonly string[]
}

/**
 * The editor `handover review` opens: `editor` is the command word a person reads (`code`), `command` the whole
 * argument vector to run (the executable, its flags, then the paths to open).
 */
export type ResolvedEditor = {
	editor: string
	command: string[]
}

/** What `resolveEditor` reads: the worktree's git config, the search path, and the paths the editor opens. */
export type ResolveEditorParams = {
	/** The folder `git config --get dialecte.editor` is read from (the lot's worktree). */
	cwd: string
	/** The value of `PATH` the candidates are searched in; undefined when `PATH` is not set. */
	searchPath: string | undefined
	/** The paths appended to the command, in order; none for the card, which only names the editor. */
	paths: readonly string[]
}
