/** Invented words, never a word of anyone's list. */
export const FIRST_WORD = 'zorblat'
export const SECOND_WORD = 'quimby-x'
export const THIRD_WORD = 'vexalon'

/** The git config key of the list, and the file the user's list is in under a config folder. */
export const FORBIDDEN_WORDS_KEY = 'dialecte.forbiddenWords'
export const USER_FILE_PATH = 'dialecte/forbidden-words'

/** The config folder and the home folder the cases point the environment at. */
export const XDG_VARIABLE = 'XDG_CONFIG_HOME'
export const HOME_VARIABLE = 'HOME'
export const HOME_CONFIG_FOLDER = '.config'

/** The source file the cases edit. */
export const WORD_SOURCE_FILE = 'src/a.ts'

/** A file nobody can read. */
export const UNREADABLE_MODE = 0o000

/** The line `rules` prints when no list is configured starts with this. */
export const NO_LIST_LINE_START = 'forbidden words:'

/** A word as the list may hold it in capitals, and a word with a regular expression character. */
export const CAPITAL_WORD = 'ZORBLAT'
export const DOTTED_WORD = 'quimby.x'
export const DOTTED_LOOKALIKE = 'quimbyzx'
