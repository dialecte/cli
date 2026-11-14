/** Why a file operation failed, in a word a line can hold. */

/** The system's code of a failed operation (`ENOENT`, `EACCES`, `EISDIR`), else its message. */
export function errorReasonOf(error: unknown): string {
	if (error instanceof Error && 'code' in error && typeof error.code === 'string') return error.code
	return error instanceof Error ? error.message : String(error)
}

/** The first line of an error's message (git's can span several), as a refusal or a `!` line shows it. */
export function firstLineOf(error: unknown): string {
	return (error instanceof Error ? error.message : String(error)).split('\n')[0]
}
