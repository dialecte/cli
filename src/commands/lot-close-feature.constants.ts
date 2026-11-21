/** The usage line of `lot close --feature`. */
export const LOT_CLOSE_FEATURE_USAGE =
	'usage: dialecte lot close --feature <name> [--json] (no lot names beside it)'

/** `lot close --feature`'s own lines; `{...}` filled. */
export const LOT_CLOSE_FEATURE_TEXTS = {
	noLot: 'lot close --feature {feature}: no lot of the feature {feature}: nothing moved',
	open: 'lot close --feature {feature}: refused, a lot of the feature is still open: nothing moved',
	openLot: '  {lot} {state}',
	clone: 'clone {clone}  kept ({kept})',
} as const

/** The states a lot of the feature must be in for its close: every other one refuses it. */
export const CLOSABLE_STATES: readonly string[] = ['committed', 'canceled']

/** The flag that makes `lot close` a feature's close. */
export const FEATURE_FLAG = '--feature'
