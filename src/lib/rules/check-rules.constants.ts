/** Between two paths of a scoped gate step's changed list, and after the last. */
export const NUL_SEPARATOR = '\0'

/** The files parsed before their rules run: a syntax error is an error of the file, never a silent skip. */
export const SCRIPT_FILE_PATTERN = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/

/** A file that cannot be read, a changed list that cannot be read, a file that does not parse: `{why}` says why. */
export const UNREADABLE_FILE_MESSAGE = 'the file cannot be read: {why}'
export const UNREADABLE_LIST_FILE_MESSAGE = 'the changed list of the gate cannot be read: {why}'
export const UNPARSABLE_FILE_MESSAGE = 'the file does not parse: {why}'

/** The summary of a run that checked files, and of one that had none to check. */
export const RULES_SUMMARY_LINE = 'rules: {files} file(s), {errors} error(s), {warnings} warning(s)'
export const RULES_NOTHING_LINE = 'rules: no changed file to check'

/** The id a scoped `rules` step selects in the gate's selection: its reasons are the files it checked. */
export const RULES_SELECTION_ID = 'rules'
