/** A silent hook or a waiting lock says it is still there this often. */
export const HEARTBEAT_INTERVAL_MILLISECONDS = 30_000

/** After this many silent beats in a row, the heartbeat says what a silent hook often is. */
export const HEARTBEAT_HINT_AFTER_BEATS = 3

/** What a silent hook often is, said once it has been silent that long. */
export const SILENT_HOOK_HINT =
	'is it waiting for input, or running in watch mode (vitest without `run`)?'

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

/** A spinner's frames, one per redraw. */
export const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const

/** How often a spinner is redrawn. */
export const SPINNER_TICK_MILLISECONDS = 100

/** On a terminal, how many last lines of a running hook show under its spinner. */
export const LIVE_TAIL_LINES = 20

/** Erases the terminal's current line, the cursor back at its start. */
export const ERASE_LINE = '\r\u001B[2K'

/** Moves the cursor one line up and erases that line. */
export const ERASE_LINE_ABOVE = '\u001B[1A\u001B[2K'

/** A tab moves the text to the next multiple of this many cells. */
export const TAB_STOP = 8

/**
 * Code points a terminal draws two cells wide (East Asian Width W and F): CJK, Hangul, full-width forms,
 * the emoji planes and the characters below U+FFFF shown as emoji.
 */
export const WIDE_CHARACTER_RANGES: readonly (readonly [number, number])[] = [
	[0x231a, 0x231b],
	[0x23e9, 0x23ec],
	[0x23f0, 0x23f0],
	[0x23f3, 0x23f3],
	[0x25fd, 0x25fe],
	[0x2614, 0x2615],
	[0x2648, 0x2653],
	[0x267f, 0x267f],
	[0x2693, 0x2693],
	[0x26a1, 0x26a1],
	[0x26aa, 0x26ab],
	[0x26bd, 0x26be],
	[0x26c4, 0x26c5],
	[0x26ce, 0x26ce],
	[0x26d4, 0x26d4],
	[0x26ea, 0x26ea],
	[0x26f2, 0x26f3],
	[0x26f5, 0x26f5],
	[0x26fa, 0x26fa],
	[0x26fd, 0x26fd],
	[0x2705, 0x2705],
	[0x270a, 0x270b],
	[0x2728, 0x2728],
	[0x274c, 0x274c],
	[0x274e, 0x274e],
	[0x2753, 0x2755],
	[0x2757, 0x2757],
	[0x2795, 0x2797],
	[0x27b0, 0x27b0],
	[0x27bf, 0x27bf],
	[0x2b1b, 0x2b1c],
	[0x2b50, 0x2b50],
	[0x2b55, 0x2b55],
	[0x1100, 0x115f],
	[0x2e80, 0xa4cf],
	[0xac00, 0xd7a3],
	[0xf900, 0xfaff],
	[0xfe30, 0xfe6f],
	[0xff00, 0xff60],
	[0xffe0, 0xffe6],
	[0x1f300, 0x1f64f],
	[0x1f680, 0x1f6ff],
	[0x1f7e0, 0x1f7eb],
	[0x1f900, 0x1f9ff],
	[0x1fa70, 0x1faff],
	[0x20000, 0x3fffd],
]

/** A regional indicator: two of them are one flag, two cells wide. */
export const REGIONAL_INDICATOR_RANGE = [0x1f1e6, 0x1f1ff] as const

/** The emoji variation selector: the character before it is shown as an emoji, two cells wide. */
export const EMOJI_PRESENTATION_SELECTOR = 0xfe0f

/** Code points that take no cell: combining marks, the zero-width joiner, variation selectors. */
export const ZERO_WIDTH_RANGES: readonly (readonly [number, number])[] = [
	[0x0300, 0x036f],
	[0x200b, 0x200f],
	[0xfe00, 0xfe0f],
]
