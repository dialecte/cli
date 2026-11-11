import type { WaitClock } from './lot-wait.types.ts'

/** The flags and the value options `lot wait` takes, without the dashes. */
export const WAIT_FLAGS: readonly string[] = ['json']
export const WAIT_VALUE_OPTIONS: readonly string[] = ['timeout']

/** The signature of a path the wait looks at that does not exist (yet): a folder made later reads as a change. */
export const MISSING_SIGNATURE = '-'

/** How the names of a folder join in the signature. */
export const NAMES_SEPARATOR = '/'

/** The clock of the running process, when no test gives one. */
export const SYSTEM_CLOCK: WaitClock = { now: Date.now }

/** The line `lot wait` refreshes on a terminal; `{name}` the lot, `{state}` its state, `{elapsed}` the time waited. */
export const WAITING_LINE = 'waiting {name} ({state}, {elapsed})'
