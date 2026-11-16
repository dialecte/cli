/** Why a store is skipped; `{detail}` the error code (or message) of the listing. */
export const SKIPPED_STORE_REASONS = {
	notFolder: 'not a folder',
	unreadable: 'cannot be read ({detail})',
} as const

/** The error code of a listing of a path that is no folder. */
export const NOT_A_FOLDER_CODE = 'ENOTDIR'
