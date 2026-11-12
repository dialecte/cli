/** One row of the system's process list: the process, its parent, its controlling terminal and its command. */
export type ProcessRow = {
	pid: number
	ppid: number
	/** The process group: the processes of one shell pipeline share it. */
	pgid: number
	/** The controlling terminal; `?`, `??` or empty when the process has none. */
	tty: string
	/** The executable (`comm`): a path, or a bare name. */
	command: string
	/** The command line (`args`). */
	args: string
}

/** A process working in the worktree: its pid, its command line (cut for the card) and its working folder. */
export type StrayProcess = {
	pid: number
	command: string
	folder: string
}

/**
 * The processes working in a worktree: the ones left behind (they block), the person's tools (shown), and why the
 * process list is not known (neither is then judged).
 */
export type StrayProcesses = {
	leftBehind: StrayProcess[]
	tools: StrayProcess[]
	unknown?: string
}

/**
 * What the card and the guard say of the processes: `failed` for processes left behind, `warning` for the person's
 * tools only or a list not known, `passed` when none works in the worktree.
 */
export type StrayProcessesLine = {
	status: 'passed' | 'warning' | 'failed'
	detail: string
}
