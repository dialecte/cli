import type { BackgroundSpawner } from '../lib/worktree/worktree.types.ts'

/** What `handover review` reads besides its arguments. */
export type HandoverReviewParams = {
	/** The words after `handover review`: the hand-over (name, index or folder), `--json`, `--print`. */
	argv: string[]
	/** Where the hand-over is looked up (the store of its repository). */
	cwd: string
	/** The `PATH` the editor is searched in. Default: the process's. */
	searchPath?: string
	/** Starts the editor detached (the tests stand in for it and record the call). Default: a detached process. */
	spawner?: BackgroundSpawner
}

/** `handover review --json` refused (exit 2): the message, as written. */
export type HandoverReviewRefusalJson = {
	error: string
}

/** `handover review --json`: the editor word, the whole command, and the paths it opens. */
export type HandoverReviewJson = {
	editor: string
	command: string[]
	opened: string[]
}
