/** The `lot` guard of `handover run` and the card's gate line of the same name. */
export const STORE_LOT_GUARD_NAME = 'lot'

/** The start of the go-ahead row's decision (D1, D28: matched exactly, the colon included). */
export const NOT_A_LOT_DECISION_PREFIX = 'not a store lot:'

/** The texts of the `lot` guard (33L1 6b, D27); `{folder}`, `{name}`, `{reason}`, `{by}` filled in. */
export const STORE_LOT_GUARD_TEXTS = {
	notALot: '{folder} is not a lot of the store: start lots with dialecte lot start (LOT-RULES)',
	simulated: '{name} is a simulated lot: a simulated lot never commits',
	damaged: '{name} is a damaged lot of the store: {reason}',
	goAhead: 'not a store lot (by {by}: {reason})',
} as const

/** The card's failed `lot` line for a folder that is not a store lot and holds no go-ahead row (33L1 6b, U2). */
export const NOT_A_LOT_CARD_DETAIL =
	'not a store lot: handover run will refuse (go ahead with --not-a-lot --by <who> --reason <text>)'

/** The usage refusals of `handover run --not-a-lot --by --reason` (D27). */
export const NOT_A_LOT_USAGE = {
	needsBoth:
		'handover run: --not-a-lot needs --by <who> and --reason <text>, neither empty nor holding a line break',
	goesWithFlag: 'handover run: --by and --reason go with --not-a-lot',
} as const

/** The verb the forbidden-word refusal of `--by` and `--reason` names (U3). */
export const NOT_A_LOT_VERB = 'handover run'

/** The flag of the go-ahead and its two value options, without their dashes. */
export const NOT_A_LOT_FLAG = 'not-a-lot'
export const NOT_A_LOT_VALUE_OPTIONS = ['by', 'reason'] as const

/** What starts an option word: a word after `--by` or `--reason` starting so is an option, not their value. */
export const OPTION_PREFIX = '--'
