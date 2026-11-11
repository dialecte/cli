/** The registry entries of other lots a wait must not touch while it polls. */
export const OTHER_ENTRY_NAMES = [
	'2026-11-01-feat-first',
	'2026-11-02-feat-second',
	'2026-11-03-feat-third',
]

/** The wait's timeout in seconds: one sleep and one poll each. */
export const WAIT_SECONDS = 3

/** The sleep after which the counting starts: the first read is behind it, the polls that follow read nothing. */
export const ARMING_SLEEP = 1

/** The polls counted: those after the arming sleep. */
export const COUNTED_POLLS = WAIT_SECONDS - ARMING_SLEEP + 1
