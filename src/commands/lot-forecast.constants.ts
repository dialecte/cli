/** The flags and value options of `lot forecast`. */
export const FORECAST_FLAGS: readonly string[] = ['json']
export const FORECAST_VALUE_OPTIONS: readonly string[] = ['against']

/** The texts `lot forecast` prints and refuses with. */
export const LOT_FORECAST_TEXTS = {
	extra: 'lot forecast takes at most one id, not also {extra}',
	noLot: 'lot forecast: no lot holds this folder: give its id',
	damaged: 'lot forecast: {lot} damaged: {damage}',
	notOpen: 'lot forecast: {lot} is {state}: only an open lot has a forecast',
	againstSelf: 'lot forecast: --against names the lot itself',
	againstClosed: 'lot forecast: --against {lot}: not an open lot of the same store',
	header: 'forecast {lot} (run {run}, {seconds} s)',
	line: '{against}: {verdict}{details}',
	mainLabel: 'main ({ref} {commit})',
	shares: 'shares {paths}',
	more: '{count} more',
	conflictWithLines: '{path}:{ranges} ({kind})',
	conflictWithoutLines: '{path} ({kind})',
	unknown: 'unknown: {reason}',
	verdict: 'forecast: {verdict}',
	writeFailure: 'lot forecast: {file} not written: {message}',
	eventFailure: '! forecast event not written to {file}: {message}',
} as const

/** Between two parts of a line, two paths, two ranges and two conflicts. */
export const FORECAST_PART_SEPARATOR = ' · '
export const FORECAST_LIST_SEPARATOR = ', '
export const FORECAST_CONFLICT_SEPARATOR = '; '

/** How many characters of a main commit the text names. */
export const FORECAST_SHORT_COMMIT = 8

/** The state word of a simulated lot in the refusal: a simulated lot has no work to forecast. */
export const SIMULATED_WORD = 'simulated'
