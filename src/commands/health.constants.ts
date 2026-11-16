/** The command's name, as the command map knows it. */
export const HEALTH_COMMAND = 'health'

/** The flags and the value options `health` takes, without the dashes. */
export const HEALTH_FLAGS: readonly string[] = ['json']
export const HEALTH_VALUE_OPTIONS: readonly string[] = ['since', 'repository']

/** The window a run reads without `--since`: the seven days before now. */
export const DEFAULT_SINCE_MS = 7 * 86_400_000

/** A `--since` duration: a whole number of hours or days before now. */
export const DURATION_PATTERN = /^(\d+)([hd])$/

/** How long one unit of a `--since` duration lasts. */
export const DURATION_UNIT_MS: Readonly<Record<string, number>> = { h: 3_600_000, d: 86_400_000 }

/** A `--since` date: its midnight UTC. */
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** A `--since` date and time: its zone written (`Z` or an offset), so the window never depends on the machine's. */
export const DATE_TIME_PATTERN =
	/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/

/** The refusal of a word after `health`; `{words}` is filled with them. */
export const HEALTH_WORDS_REFUSAL = 'health takes no word: {words}'

/** The refusal of a `--since` that is neither a duration nor a date; `{value}` is filled with it. */
export const HEALTH_SINCE_REFUSAL = '--since takes <n>h, <n>d or a date: {value}'
