/** The one platform with a hold: macOS, through `caffeinate`. */
export const KEEP_AWAKE_PLATFORM: NodeJS.Platform = 'darwin'

/** The program that holds the idle-sleep assertion, found on the search path. */
export const CAFFEINATE_PROGRAM = 'caffeinate'

/** `caffeinate -i -w <pid>`: no idle sleep while the process `<pid>` runs (the pid is appended). */
export const CAFFEINATE_ARGUMENTS: readonly string[] = ['-i', '-w']

/** The variable that turns the hold off, and the value that does. */
export const KEEP_AWAKE_VARIABLE = 'DIALECTE_KEEP_AWAKE'
export const KEEP_AWAKE_OFF = '0'
