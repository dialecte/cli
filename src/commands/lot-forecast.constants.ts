/** The flags and value options of `lot forecast`. */
export const FORECAST_FLAGS: readonly string[] = ['json']
export const FORECAST_VALUE_OPTIONS: readonly string[] = ['against']

/** The texts `lot forecast` prints and refuses with. */
export const LOT_FORECAST_TEXTS = {
	extra: 'lot forecast takes at most one id, not also {extra}',
	noLot: 'lot forecast: no lot holds this folder: give its id',
	refused: 'lot forecast: {refusal}',
	againstSelf: 'lot forecast: --against names the lot itself',
	againstClosed: 'lot forecast: --against {lot}: not an open lot of the same store',
	header: 'forecast {lot} (run {run}, {seconds} s)',
	line: '{against}: {verdict}{details}',
	mainLabel: 'main ({ref} {commit})',
	shares: 'shares {paths}',
	more: '{count} more',
	unknown: 'unknown: {reason}',
	verdict: 'forecast: {verdict}',
	settled:
		'! {lot}: merged on {base} at {tip}, not settled yet: it holds nothing (lot close {lot} settles it)',
} as const

/** Between two parts of a line and two paths. */
export const FORECAST_PART_SEPARATOR = ' · '
export const FORECAST_LIST_SEPARATOR = ', '

/** How many characters of a main commit the text names. */
export const FORECAST_SHORT_COMMIT = 8
