/** The old homes of the settings (C8, U2): what each was, and the texts naming them. */

/** The file whose `"dialecte"` table held the project settings before `.dialecterc`. */
export const PACKAGE_JSON_FILE_NAME = 'package.json'

/** The package.json field holding the old settings (and the manifest keys, D2). */
export const PACKAGE_JSON_FIELD = 'dialecte'

/** The file of the gate steps of a root without package.json, before `.dialecterc`. */
export const DIALECTE_JSON_FILE_NAME = 'dialecte.json'

/** The prefix of an old home's key: `dialecte.gate` (package.json), `dialecte.editor` (git config). */
export const OLD_HOME_KEY_PREFIX = 'dialecte.'

/** The package.json names that became a sub-field of a `.dialecterc` key (C7). */
export const RENAMED_PACKAGE_JSON_KEYS: Readonly<Record<string, string>> = {
	allowReferences: 'references.allow',
	referencePatterns: 'references.patterns',
}

/** The personal keys git config held before config.yml: a text compared exactly, or a comma list of words. */
export const OLD_GIT_CONFIG_KEYS: readonly { key: string; shape: 'text' | 'list' }[] = [
	{ key: 'editor', shape: 'text' },
	{ key: 'personProcesses', shape: 'list' },
	{ key: 'forbiddenWords', shape: 'list' },
	{ key: 'consumerNames', shape: 'list' },
]

/** The git keys of the old personal settings, read in one `git config --get-regexp`. */
export const OLD_GIT_KEYS_PATTERN = '^dialecte\\.'

/** What ends each entry of `git config --get-regexp -z`. */
export const GIT_CONFIG_ENTRY_SEPARATOR = '\0'

/** What separates a key from its value in an entry of `git config --get-regexp -z`. */
export const GIT_CONFIG_VALUE_SEPARATOR = '\n'

/** How a finding names git config as its file (no line: `0`). */
export const GIT_CONFIG_FILE_LABEL = 'git config'

/** The old file of forbidden words, before config.yml `forbiddenWords`; also the key its findings carry. */
export const FORBIDDEN_WORDS_FILE_NAME = 'forbidden-words'

/** The config.yml key the forbidden-words file moved to. */
export const FORBIDDEN_WORDS_CONFIG_KEY = 'forbiddenWords'

/** The cli version every repository must be past before an old copy can go. */
export const OLD_HOMES_LAST_READER = 'cli 0.7'

/** A package.json `"dialecte"` setting: `{key}` the old name, `{target}` the `.dialecterc` key to write. */
export const PACKAGE_JSON_SETTING_PROBLEM =
	'package.json "dialecte" no longer holds settings: write {key} in .dialecterc as {target}'

/** A dialecte.json at the root. */
export const DIALECTE_JSON_PROBLEM =
	'dialecte.json is no longer read: write its settings in .dialecterc'

/** A git key config.yml does not hold: `{key}` the config.yml key, `{file}` the personal file. */
export const GIT_KEY_PROBLEM =
	'this git key is no longer read and {file} does not hold its value: write {key} there'

/** A git key config.yml already holds: `{gitKey}` the git key. */
export const GIT_KEY_NOTE = `git config {gitKey}: config.yml already holds it; run git config --unset {gitKey} once every repository is past ${OLD_HOMES_LAST_READER}`

/** A forbidden word config.yml lacks: `{file}` the personal file, `{word}` the first missing word. */
export const FORBIDDEN_WORDS_FILE_PROBLEM = `this file is no longer read and {file} ${FORBIDDEN_WORDS_CONFIG_KEY} lacks '{word}': add every word of this file there`

/** A forbidden-words file that cannot be read: `{why}` the system's reason. */
export const FORBIDDEN_WORDS_FILE_UNREADABLE =
	'this file is no longer read and cannot be read to check it: {why}'

/** A forbidden-words file whose words config.yml holds: `{file}` the file. */
export const FORBIDDEN_WORDS_FILE_NOTE = `{file}: config.yml ${FORBIDDEN_WORDS_CONFIG_KEY} already holds its words; delete it once every repository is past ${OLD_HOMES_LAST_READER}`

/** An empty git key, nothing to migrate (D17): `{gitKey}` the git key. */
export const GIT_KEY_EMPTY_NOTE = `git config {gitKey}: empty, nothing to migrate; run git config --unset {gitKey} once every repository is past ${OLD_HOMES_LAST_READER}`
