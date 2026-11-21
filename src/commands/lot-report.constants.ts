/** The option of `lot report` that names a feature instead of a lot. */
export const FEATURE_OPTION = 'feature'

/** The options `lot report` takes followed by a value, without the dashes. */
export const REPORT_VALUE_OPTIONS: readonly string[] = [FEATURE_OPTION]

/** The flag of `lot report` that lists every kept lot instead of one lot (KEEP 3.6). */
export const KEPT_FLAG = 'kept'

/** Why `lot report --kept` refuses its words: an id, or another listing beside it. */
export const KEPT_USAGE_TEXTS = {
	id: 'lot report --kept takes no id, not {id}',
	feature: 'lot report --kept does not go with --feature',
	simulated: 'lot report --kept does not go with --simulated',
} as const

/** The flags `lot report` takes, without the dashes. */
export const REPORT_FLAGS: readonly string[] = ['json', 'simulated', KEPT_FLAG]
