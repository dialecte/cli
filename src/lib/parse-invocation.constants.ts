/** The flags the cli reads before any command runs: the help, and the help as JSON. */

/** Asks for the help: after a command, that command's; with none, the global one. */
export const HELP_FLAG = '--help'

/** The short form of `--help`. */
export const HELP_SHORT_FLAG = '-h'

/** With a help flag, asks for the help as JSON. */
export const JSON_FLAG = '--json'

/** The flags that ask for the help. */
export const HELP_ASKING_FLAGS: readonly string[] = [HELP_FLAG, HELP_SHORT_FLAG]

/** The flags that ask for the help, and for it as JSON: not a word of the command they follow. */
export const HELP_FLAGS: readonly string[] = [...HELP_ASKING_FLAGS, JSON_FLAG]
