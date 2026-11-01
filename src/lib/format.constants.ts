/** The most files a failing oxfmt's warning names; the others are counted (`and <n> more`). */
export const FAILED_FILES_NAMED = 10

/** Before the warnings `formatFiles` prints. */
export const WARNING_INDENT = '  '

/** Before each file and each line of oxfmt's own under a failure warning. */
export const FAILURE_DETAIL_INDENT = '    '

/** After the exit status in the warning of an oxfmt that ran and failed. */
export const EXITED_WARNING_END = '— emitted files may be unformatted'

/** After the error message in the warning of an oxfmt that could not start. */
export const NOT_STARTED_WARNING_END = '— emitted files left unformatted'
