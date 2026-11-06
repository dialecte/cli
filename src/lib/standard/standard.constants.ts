/** The record of the standard check, in the hand-over folder. */
export const STANDARD_FILE = 'standard.json'

/** The environment variable that names the standard (a file or a folder); the cli never ships one. */
export const STANDARD_ENVIRONMENT_VARIABLE = 'DIALECTE_STANDARD'

/** The states `lot standard` takes. */
export const STANDARD_STATES = ['consulted', 'not-consulted'] as const

export const STANDARD_USAGE =
	'lot standard: expected <folder> consulted <note> | not-consulted <reason>'

/** The card's line name. */
export const STANDARD_LINE_NAME = 'standard'

/** The card's standard line: consulted, configured and not consulted, none configured. */
export const STANDARD_CONSULTED_DETAIL = 'consulted · {note}'
export const STANDARD_NOT_CONSULTED_DETAIL =
	'configured, not consulted: dialecte lot standard {folder} consulted <note>'
export const STANDARD_NOT_CONFIGURED_DETAIL = 'not consulted: none configured (DIALECTE_STANDARD)'
