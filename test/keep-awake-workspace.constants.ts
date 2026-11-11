/** The program the hold starts, and the variable that turns the hold off. */
export const CAFFEINATE_NAME = 'caffeinate'
export const KEEP_AWAKE_VARIABLE = 'DIALECTE_KEEP_AWAKE'

/** What the hold starts: `caffeinate -i -w <pid>`, the pid being appended. */
export const CAFFEINATE_ARGUMENTS = ['-i', '-w']

/** The pid the unit cases hand the hold. */
export const OWN_PID = 4242

/** A program that exits at once, as an executable file's text. */
export const NOOP_PROGRAM = '#!/bin/sh\nexit 0\n'

/** Permission bits: executable by anyone, and a file that is not executable. */
export const EXECUTABLE_MODE = 0o755
export const NOT_EXECUTABLE_MODE = 0o644
