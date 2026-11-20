/** The variables the change base is read from: the base a caller hands the bench, and the CI convention. */
export const CHANGE_BASE_VARIABLES = {
	/** The base handed to the type bench (a gate's type-bench step, a CI job). */
	handed: 'DIALECTE_CHANGE_BASE',
	/** Set by every CI service. */
	ci: 'CI',
} as const

/** What `resolveChangeBase` answers when the order finds no base at all. */
export const NO_BASE_LINE = 'no base'
