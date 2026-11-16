/** How many leftover entries of the suite's temporary folder a failed guard names before `and n more`. */
export const LEFTOVERS_NAMED = 10

/** How many of the paths a leftover folder holds the guard names: enough to tell what wrote them. */
export const LEFTOVER_PATHS_NAMED = 3

/** One line of an origins file: `<entry name>` TAB `<test file> > <test name>`. */
export const ORIGIN_SEPARATOR = '\t'

/** How many of the processes holding a leftover (their cwd or an open file in it) the guard names. */
export const LEFTOVER_HOLDERS_NAMED = 3

/** Linux's process folder: `<pid>/cwd` and `<pid>/fd/*` link into what a process holds, `<pid>/cmdline` its words. */
export const PROCESS_FOLDER = '/proc'

/** How long the guard waits for `lsof` (where /proc is missing) before it names no holder: a failing run never hangs. */
export const LSOF_TIMEOUT_MILLISECONDS = 10_000
