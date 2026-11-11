/** The git config key listing a contributor's forbidden words (comma-separated). */
export const FORBIDDEN_WORDS_KEY = 'dialecte.forbiddenWords'

/** The user file of the list, under the config folder: one word per line. */
export const FORBIDDEN_WORDS_FILE = ['dialecte', 'forbidden-words'] as const

/** The config folder's variable, and the folder under the home used when it is unset. */
export const CONFIG_HOME_VARIABLE = 'XDG_CONFIG_HOME'
export const HOME_CONFIG_FOLDER = '.config'

/** A line of the user file starting with it is a comment. */
export const COMMENT_MARK = '#'

/** Between two words of the git config list. */
export const WORD_SEPARATOR = ','

export const FORBIDDEN_WORD_LABEL = 'forbidden word'

/** What `rules` prints for a contributor whose machine holds no list: `{file}` is the user file. */
export const NO_FORBIDDEN_WORDS_LINE = `forbidden words: no list (git config ${FORBIDDEN_WORDS_KEY} or {file})`

/** The code of a read whose file is not there: no list, never an error. */
export const MISSING_FILE_CODE = 'ENOENT'

/** Why the user file could not be read: `{file}` the file, `{why}` the system's reason. */
export const UNREADABLE_LIST_MESSAGE = 'the forbidden words list {file} cannot be read: {why}'
