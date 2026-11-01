export const LOCK_USAGE = 'lock: run [--no-wait] -- <command> [<argument>...]'

/** The exit code of a command that cannot be found, as a shell says it. */
export const COMMAND_NOT_FOUND_EXIT_CODE = 127

/** The exit code of a command found but that cannot be run (not executable), as a shell says it. */
export const COMMAND_NOT_RUNNABLE_EXIT_CODE = 126

/** A command ended by a signal exits with this plus the signal's number, as a shell says it. */
export const SIGNAL_EXIT_CODE_BASE = 128
