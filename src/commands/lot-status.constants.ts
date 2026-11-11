/** The flags `lot status` takes, without the dashes. */
export const STATUS_FLAGS: readonly string[] = ['json']

/** Why `lot status` is a usage error: `{extra}` the words beyond the id. */
export const STATUS_USAGE_REASONS = {
	noId: 'lot status takes one id: none given',
	extra: 'lot status takes one id, not also {extra}',
} as const

/** The most lines the text form of `lot status` prints. */
export const STATUS_MAX_LINES = 5
