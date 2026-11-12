/** The git config key naming the person's own processes (a comma list), never committed. */
export const PERSON_PROCESSES_KEY = 'dialecte.personProcesses'

/** The `handover run` guard that judges the processes working in the worktree. */
export const PROCESSES_GUARD_NAME = 'processes'

/** How many characters of a command line the card shows. */
export const COMMAND_SHOWN_LENGTH = 60

/** The card line and the guard detail for processes left behind: `{list}` is `<pid> <command>`, joined by `, `. */
export const LEFT_BEHIND_DETAIL =
	'{count} left running in the worktree: {list}  (stop them: kill {pids})'

/** The card line for the person's tools: `{names}` the unique command names, joined by `, `. */
export const TOOLS_DETAIL = 'open on the worktree: {names}'

/** The card line and the guard detail when the process list cannot be read. */
export const PROCESSES_NOT_KNOWN_DETAIL = 'not known ({why})'

/** The guard detail when no process other than the run's own works in the worktree. */
export const NO_PROCESSES_DETAIL = 'none running in the worktree'

/** What ends a command line cut for the card. */
export const COMMAND_CUT_MARK = '…'

/** The `tty` values of a process without a controlling terminal (Linux `?`, macOS `??`, or nothing). */
export const NO_TERMINAL_MARKS: readonly string[] = ['?', '??', '']

/**
 * The `ps` keywords and headers of the first process list: the tree and the executable. The executable (`comm`)
 * comes last, never cut, and may hold spaces; every column before it is ASCII, so the header line tells where it
 * starts. The command line is read by a second list: `ps` pads a column by bytes, so a column after one holding
 * bytes beyond ASCII would be read shifted.
 */
export const PS_TREE_HEADERS = {
	pid: 'PID',
	ppid: 'PPID',
	pgid: 'PGID',
	tty: 'TTY',
	comm: 'COMM',
} as const

/** How the start of a tree row reads: the pid, the parent's pid, the process group, the terminal (maybe empty). */
export const PS_TREE_ROW_START_PATTERN = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S*)\s*$/

/** The `ps` keywords and headers of the second process list: the pid, then the command line last, never cut. */
export const PS_ARGS_HEADERS = { pid: 'PID', args: 'ARGS' } as const

/** How a command-line row reads: the pid, then the command line whatever its bytes (maybe empty). */
export const PS_ARGS_ROW_PATTERN = /^\s*(\d+)(?:\s(.*))?$/
