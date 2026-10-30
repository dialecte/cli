/** A silent hook or a waiting lock says it is still there this often. */
export const HEARTBEAT_INTERVAL_MILLISECONDS = 30_000

/** After this many silent beats in a row, the heartbeat says what a silent hook often is. */
export const HEARTBEAT_HINT_AFTER_BEATS = 3

/** A child that prints nothing and whose process tree gains no CPU for this long is stalled. */
export const STALL_AFTER_MILLISECONDS = 10 * 60_000

/** How often the watchdog samples a child's process tree. */
export const STALL_CHECK_EVERY_MILLISECONDS = 5_000

/** How long a stopped tree gets between the polite signal and SIGKILL; also the wait for it to be gone after SIGKILL. */
export const KILL_GRACE_MILLISECONDS = 2_000

/** How often a stopped tree is looked at while waiting for its processes to be gone. */
export const KILL_POLL_MILLISECONDS = 25

/**
 * Every process of the machine, one line each: pid, parent pid, process group, state, CPU time, full
 * command (macOS and Linux).
 */
export const PROCESS_LIST_ARGUMENTS = [
	'-A',
	'-ww',
	'-o',
	'pid=,ppid=,pgid=,stat=,time=,command=',
] as const

/** One line of the process list. */
export const PROCESS_LINE_PATTERN = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(.*)$/

/** A process listing that takes longer is given up: that sample has no verdict. */
export const PROCESS_LIST_TIMEOUT_MILLISECONDS = 10_000

/** The interrupts this process passes on to a running child's process group before it ends by them. */
export const FORWARDED_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const
