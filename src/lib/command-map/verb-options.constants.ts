/** What the option check of a command line reads in a usage line. */

/** The text after a usage line's flag that makes it a value option: a placeholder (`<ref>`) or a value word (`low|high`). */
export const VALUE_AFTER_FLAG_PATTERN = /^ (?:<|[a-z])/

/** The flag a JSON answer is asked with: a refusal answers in JSON too when the verb takes it. */
export const JSON_OPTION = 'json'

/** The word that ends the options of a command line: every word after it is positional. */
export const END_OF_OPTIONS = '--'

/** How a usage line writes `--`, a word of its own: `dialecte lock run [...] -- <command>`. */
export const USAGE_END_OF_OPTIONS = ' -- '
